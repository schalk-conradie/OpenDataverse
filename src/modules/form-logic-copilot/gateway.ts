import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"
import type {
  DataverseEnvironment,
  FormLogicEntitySummary,
  FormLogicFormContext,
  FormLogicFormSummary,
} from "@/core/dataverse/schemas"

export async function listFormLogicEntities(
  environment: DataverseEnvironment,
): Promise<FormLogicEntitySummary[]> {
  if (isTauriRuntime()) {
    return invoke<FormLogicEntitySummary[]>("list_form_logic_entities", {
      environment,
    })
  }

  const { mockFormLogicEntities } = await import("./mock-data")
  return mockFormLogicEntities
}

export async function listFormLogicForms(
  environment: DataverseEnvironment,
  entityLogicalName: string,
): Promise<FormLogicFormSummary[]> {
  if (isTauriRuntime()) {
    return invoke<FormLogicFormSummary[]>("list_form_logic_forms", {
      environment,
      entityLogicalName,
    })
  }

  const { mockFormLogicForms } = await import("./mock-data")
  return mockFormLogicForms[entityLogicalName] ?? []
}

export async function getFormLogicFormContext(
  environment: DataverseEnvironment,
  entityLogicalName: string,
  formId: string,
): Promise<FormLogicFormContext> {
  if (isTauriRuntime()) {
    return invoke<FormLogicFormContext>("get_form_logic_form_context", {
      environment,
      entityLogicalName,
      formId,
    })
  }

  const { mockFormLogicContexts, mockFormLogicForms, mockFormLogicEntities } =
    await import("./mock-data")
  const context = mockFormLogicContexts[formId]
  if (context) {
    return context
  }

  const fallbackEntity =
    mockFormLogicEntities.find(
      (entity) => entity.logicalName === entityLogicalName,
    ) ?? mockFormLogicEntities[0]
  if (!fallbackEntity) {
    throw new Error("Browser preview form-logic entity data is empty")
  }

  const fallbackForm =
    mockFormLogicForms[fallbackEntity.logicalName]?.[0] ??
    Object.values(mockFormLogicForms)[0]?.[0]
  if (!fallbackForm) {
    throw new Error("Browser preview form-logic form data is empty")
  }

  const fallbackContext = mockFormLogicContexts[fallbackForm.id]
  if (!fallbackContext) {
    throw new Error("Browser preview form-logic context data is incomplete")
  }

  return fallbackContext
}
