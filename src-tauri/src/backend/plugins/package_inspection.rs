use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::{
    io::{Cursor, Read},
    path::Path,
};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginPackageInspection {
    pub(super) local_path: String,
    pub(super) file_name: String,
    pub(super) size_bytes: u64,
    pub(super) name: String,
    pub(super) version: String,
    pub(super) assembly_files: Vec<String>,
}

fn package_identity(nuspec: &str) -> Result<(String, String), String> {
    let mut reader = Reader::from_str(nuspec);
    reader.config_mut().trim_text(true);
    let (mut name, mut version) = (None, None);
    let mut in_metadata = false;

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("Invalid NuGet manifest: {error}"))?
        {
            Event::Start(tag) if tag.local_name().as_ref() == b"metadata" => in_metadata = true,
            Event::End(tag) if tag.local_name().as_ref() == b"metadata" => in_metadata = false,
            Event::Start(tag) if in_metadata && tag.local_name().as_ref() == b"id" => {
                name = Some(
                    reader
                        .read_text(tag.name())
                        .map_err(|error| format!("Invalid NuGet package id: {error}"))?
                        .trim()
                        .to_string(),
                );
            }
            Event::Start(tag) if in_metadata && tag.local_name().as_ref() == b"version" => {
                version = Some(
                    reader
                        .read_text(tag.name())
                        .map_err(|error| format!("Invalid NuGet package version: {error}"))?
                        .trim()
                        .to_string(),
                );
            }
            Event::Eof => break,
            _ => {}
        }
    }

    let name = name
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "NuGet package id is missing from the manifest.".to_string())?;
    let version = version
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "NuGet package version is missing from the manifest.".to_string())?;
    if name.len() > 100 || version.len() > 100 {
        return Err("NuGet package id and version must be 100 characters or fewer.".to_string());
    }
    Ok((name, version))
}

pub(super) fn inspect_plugin_package_bytes(
    local_path: &str,
    bytes: &[u8],
) -> Result<PluginPackageInspection, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("File is not a valid NuGet package: {error}"))?;
    let mut nuspec = None;
    let mut assembly_files = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read NuGet package entry: {error}"))?;
        let entry_name = entry.name().to_string();
        if entry_name.ends_with(".nuspec") && !entry_name.contains('/') {
            if nuspec.is_some() {
                return Err("NuGet package has more than one manifest.".to_string());
            }
            let mut manifest_bytes = Vec::new();
            entry
                .by_ref()
                .take(1_048_577)
                .read_to_end(&mut manifest_bytes)
                .map_err(|error| format!("Could not read NuGet manifest: {error}"))?;
            if manifest_bytes.len() > 1_048_576 {
                return Err("NuGet manifest is larger than 1 MB.".to_string());
            }
            nuspec = Some(
                String::from_utf8(manifest_bytes)
                    .map_err(|_| "NuGet manifest is not UTF-8 text.".to_string())?,
            );
        } else if entry_name.starts_with("lib/")
            && entry_name.to_ascii_lowercase().ends_with(".dll")
        {
            assembly_files.push(entry_name);
        }
    }

    let nuspec = nuspec.ok_or_else(|| "NuGet package has no root .nuspec manifest.".to_string())?;
    let (name, version) = package_identity(&nuspec)?;
    if assembly_files.is_empty() {
        return Err("NuGet package has no assemblies under lib/.".to_string());
    }

    Ok(PluginPackageInspection {
        local_path: local_path.to_string(),
        file_name: Path::new(local_path)
            .file_name()
            .and_then(|item| item.to_str())
            .unwrap_or("package.nupkg")
            .to_string(),
        size_bytes: bytes.len() as u64,
        name,
        version,
        assembly_files,
    })
}

#[cfg(test)]
mod tests {
    use super::inspect_plugin_package_bytes;
    use std::io::{Cursor, Write};
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn package_with(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, content) in files {
            archive
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(content).unwrap();
        }
        archive.finish().unwrap().into_inner()
    }

    #[test]
    fn reads_nuspec_identity_and_plugin_assemblies() {
        let bytes = package_with(&[
            ("Smoke.nuspec", br#"<package><metadata><id>Smoke.Plugin</id><version>1.2.3</version></metadata></package>"#),
            ("lib/net462/Smoke.Plugin.dll", b"assembly"),
        ]);
        let inspection =
            inspect_plugin_package_bytes("/tmp/Smoke.Plugin.1.2.3.nupkg", &bytes).unwrap();
        assert_eq!(inspection.name, "Smoke.Plugin");
        assert_eq!(inspection.version, "1.2.3");
        assert_eq!(inspection.assembly_files, ["lib/net462/Smoke.Plugin.dll"]);
    }

    #[test]
    fn rejects_packages_without_assemblies() {
        let bytes = package_with(&[
            ("Smoke.nuspec", br#"<package><metadata><id>Smoke.Plugin</id><version>1.2.3</version></metadata></package>"#),
        ]);
        let error = inspect_plugin_package_bytes("/tmp/Smoke.nupkg", &bytes).unwrap_err();
        assert!(error.contains("no assemblies"));
    }
}
