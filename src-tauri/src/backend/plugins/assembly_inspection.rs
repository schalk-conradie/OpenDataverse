use clrmeta::{Metadata, ResolvedType};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginDiscoveredType {
    pub(super) full_name: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    namespace: Option<String>,
    pub(super) kind: String,
    pub(super) is_abstract: bool,
    is_public: bool,
    implements_i_plugin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginAssemblyInspection {
    local_path: String,
    file_name: String,
    size_bytes: u64,
    file_hash: String,
    assembly_name: String,
    version: String,
    culture: String,
    public_key_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_framework: Option<String>,
    strong_name_signed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    clr_metadata_version: Option<String>,
    pub(super) discovered_types: Vec<PluginDiscoveredType>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct PeSection {
    virtual_address: u32,
    virtual_size: u32,
    raw_pointer: u32,
    raw_size: u32,
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "Unexpected end of PE file.".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "Unexpected end of PE file.".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn checked_slice(bytes: &[u8], offset: usize, size: usize) -> Result<&[u8], String> {
    bytes
        .get(offset..offset + size)
        .ok_or_else(|| "PE data directory pointed outside the file.".to_string())
}

fn rva_to_offset(sections: &[PeSection], rva: u32) -> Option<usize> {
    for section in sections {
        let span = section.virtual_size.max(section.raw_size);
        let end = section.virtual_address.checked_add(span)?;
        if rva >= section.virtual_address && rva < end {
            let relative = rva.checked_sub(section.virtual_address)?;
            let file_offset = section.raw_pointer.checked_add(relative)?;
            return usize::try_from(file_offset).ok();
        }
    }

    None
}

fn cli_metadata_bytes(bytes: &[u8]) -> Result<(&[u8], bool), String> {
    if checked_slice(bytes, 0, 2)? != b"MZ" {
        return Err("File is not a PE assembly.".to_string());
    }

    let pe_offset = usize::try_from(read_u32_le(bytes, 0x3c)?)
        .map_err(|_| "PE header offset overflowed.".to_string())?;
    if checked_slice(bytes, pe_offset, 4)? != b"PE\0\0" {
        return Err("File does not contain a PE header.".to_string());
    }

    let coff_offset = pe_offset + 4;
    let section_count = usize::from(read_u16_le(bytes, coff_offset + 2)?);
    let optional_header_size = usize::from(read_u16_le(bytes, coff_offset + 16)?);
    let optional_offset = coff_offset + 20;
    let optional_magic = read_u16_le(bytes, optional_offset)?;
    let data_directory_offset = match optional_magic {
        0x10b => optional_offset + 96,
        0x20b => optional_offset + 112,
        _ => return Err("Unsupported PE optional header format.".to_string()),
    };
    let cli_directory_offset = data_directory_offset + (14 * 8);
    let cli_rva = read_u32_le(bytes, cli_directory_offset)?;
    let cli_size = read_u32_le(bytes, cli_directory_offset + 4)?;
    if cli_rva == 0 || cli_size == 0 {
        return Err("PE file does not contain a CLR metadata directory.".to_string());
    }

    let section_table_offset = optional_offset + optional_header_size;
    let mut sections = Vec::new();
    for index in 0..section_count {
        let offset = section_table_offset + (index * 40);
        sections.push(PeSection {
            virtual_size: read_u32_le(bytes, offset + 8)?,
            virtual_address: read_u32_le(bytes, offset + 12)?,
            raw_size: read_u32_le(bytes, offset + 16)?,
            raw_pointer: read_u32_le(bytes, offset + 20)?,
        });
    }

    let cli_offset = rva_to_offset(&sections, cli_rva)
        .ok_or_else(|| "CLR header RVA was not mapped.".to_string())?;
    let metadata_rva = read_u32_le(bytes, cli_offset + 8)?;
    let metadata_size = read_u32_le(bytes, cli_offset + 12)?;
    let strong_name_rva = read_u32_le(bytes, cli_offset + 32).unwrap_or(0);
    let strong_name_size = read_u32_le(bytes, cli_offset + 36).unwrap_or(0);
    let metadata_offset = rva_to_offset(&sections, metadata_rva)
        .ok_or_else(|| "CLR metadata RVA was not mapped.".to_string())?;
    let metadata_size =
        usize::try_from(metadata_size).map_err(|_| "CLR metadata size overflowed.".to_string())?;

    Ok((
        checked_slice(bytes, metadata_offset, metadata_size)?,
        strong_name_rva != 0 && strong_name_size != 0,
    ))
}

fn resolved_type_name(value: &ResolvedType) -> String {
    value.full_name()
}

fn is_public_type(flags: u32) -> bool {
    matches!(flags & 0x0000_0007, 0x0000_0001 | 0x0000_0002)
}

fn is_abstract_type(flags: u32) -> bool {
    flags & 0x0000_0080 != 0 || flags & 0x0000_0020 != 0
}

fn discover_plugin_types(metadata: &Metadata) -> Vec<PluginDiscoveredType> {
    metadata
        .types()
        .into_iter()
        .enumerate()
        .filter_map(|(index, type_info)| {
            let full_name = type_info.full_name();
            if full_name == "<Module>" || full_name.starts_with('<') {
                return None;
            }

            let type_index = u32::try_from(index + 1).ok()?;
            let interfaces = metadata
                .get_interfaces(type_index)
                .into_iter()
                .map(|interface| resolved_type_name(&interface))
                .collect::<Vec<_>>();
            let base_type = metadata
                .get_base_type(type_index)
                .map(|item| item.full_name());
            let implements_i_plugin = interfaces
                .iter()
                .any(|interface| interface == "Microsoft.Xrm.Sdk.IPlugin");
            let is_workflow = base_type
                .as_deref()
                .map(|value| value == "System.Activities.CodeActivity")
                .unwrap_or(false);
            let kind = if implements_i_plugin {
                "plugin"
            } else if is_workflow {
                "workflow"
            } else {
                "unknown"
            };

            Some(PluginDiscoveredType {
                full_name,
                name: type_info.name,
                namespace: type_info.namespace,
                kind: kind.to_string(),
                is_abstract: is_abstract_type(type_info.flags),
                is_public: is_public_type(type_info.flags),
                implements_i_plugin,
                base_type,
            })
        })
        .collect()
}

fn find_target_framework(bytes: &[u8]) -> Option<String> {
    let content = String::from_utf8_lossy(bytes);
    [".NETFramework", ".NETCoreApp", ".NETStandard"]
        .iter()
        .find_map(|marker| {
            let start = content.find(marker)?;
            let tail = &content[start..];
            let end = tail
                .find(|character: char| {
                    character == '\0' || character == '\u{1}' || character == '"'
                })
                .unwrap_or_else(|| tail.len().min(96));
            Some(tail[..end.min(tail.len())].to_string())
        })
}

pub(super) fn inspect_plugin_assembly_bytes(
    local_path: &str,
    bytes: &[u8],
) -> Result<PluginAssemblyInspection, String> {
    let (metadata_bytes, has_strong_name_directory) = cli_metadata_bytes(bytes)?;
    let metadata = Metadata::parse(metadata_bytes)
        .map_err(|error| format!("Could not parse CLR metadata: {error}"))?;
    let assembly = metadata
        .assembly()
        .ok_or_else(|| "CLR metadata did not include assembly identity.".to_string())?;
    let discovered_types = discover_plugin_types(&metadata);
    let registerable_count = discovered_types
        .iter()
        .filter(|item| item.kind != "unknown" && !item.is_abstract)
        .count();
    let mut warnings = Vec::new();
    let public_key_token = assembly
        .public_key_token_string()
        .unwrap_or_else(|| "null".to_string());
    let assembly_name = assembly.name.clone();
    let assembly_version = assembly.version_string();
    let strong_name_signed = has_strong_name_directory && public_key_token != "null";

    if !strong_name_signed {
        warnings.push("Assembly is not strong-name signed.".to_string());
    }

    if registerable_count == 0 {
        warnings.push("No exported IPlugin or CodeActivity types were discovered.".to_string());
    }

    if bytes.len() > 16 * 1024 * 1024 {
        warnings.push("Assembly is larger than 16 MB.".to_string());
    }

    Ok(PluginAssemblyInspection {
        local_path: local_path.to_string(),
        file_name: Path::new(local_path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("assembly.dll")
            .to_string(),
        size_bytes: bytes.len() as u64,
        file_hash: Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
        assembly_name,
        version: assembly_version,
        culture: assembly.culture.unwrap_or_else(|| "neutral".to_string()),
        public_key_token,
        target_framework: find_target_framework(metadata_bytes)
            .or_else(|| find_target_framework(bytes)),
        strong_name_signed,
        clr_metadata_version: Some(metadata.version().to_string()),
        discovered_types,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::inspect_plugin_assembly_bytes;

    #[test]
    fn rejects_non_pe_files() {
        let error = inspect_plugin_assembly_bytes("not-a-plugin.dll", b"not a pe file")
            .expect_err("non-PE bytes must be rejected");

        assert!(error.contains("PE"));
    }
}
