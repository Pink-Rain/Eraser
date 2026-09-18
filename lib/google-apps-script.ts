import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { googleAppsScriptIntegrations } from "@/db/schema"
import { getGoogleOAuthSettings, googleOAuthAuthorizedFetch } from "@/lib/google-oauth"

const INTEGRATION_KEY = "class_images"
const APPS_SCRIPT_API = "https://script.googleapis.com/v1"

export const APPS_SCRIPT_CLOUD_PROJECT_REQUIRED = "APPS_SCRIPT_CLOUD_PROJECT_REQUIRED"

const SCRIPT_SOURCE = String.raw`
function applyEraserClassImages(payloadJson) {
  const payload = JSON.parse(payloadJson);
  const spreadsheet = SpreadsheetApp.openById(payload.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(payload.tabName);
  if (!sheet) throw new Error("ERASER_CLASSES_TAB_NOT_FOUND");

  payload.actions.forEach(function (item) {
    const cell = sheet.getRange(item.row, 4);
    if (item.action === "clear") {
      cell.clearContent();
      cell.clearNote();
      return;
    }

    const image = SpreadsheetApp.newCellImage()
      .setSourceUrl(item.url)
      .setAltTextTitle(item.title || "Illustration de classe")
      .setAltTextDescription(item.note || "Illustration synchronisée par Eraser")
      .build();
    cell.setValue(image);
    cell.setNote(item.note || "");
  });

  if (payload.rowCount > 0) {
    sheet.setRowHeights(2, payload.rowCount, 104);
    sheet.getRange(2, 4, payload.rowCount, 1)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
  }
  SpreadsheetApp.flush();
  return { updated: payload.actions.length };
}

function readEraserClassImages(payloadJson) {
  const payload = JSON.parse(payloadJson);
  const spreadsheet = SpreadsheetApp.openById(payload.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(payload.tabName);
  if (!sheet) throw new Error("ERASER_CLASSES_TAB_NOT_FOUND");

  const startRow = Math.max(1, Number(payload.startRow) || 2);
  const rowCount = Math.max(0, Number(payload.rowCount) || 0);
  if (rowCount === 0) return [];

  return sheet.getRange(startRow, 4, rowCount, 1).getValues().map(function (row) {
    const value = row[0];
    if (!value || value.valueType !== SpreadsheetApp.ValueType.IMAGE) return "";
    try {
      return value.getContentUrl() || "";
    } catch (error) {
      return "";
    }
  });
}
`.trim()

const SCRIPT_MANIFEST = JSON.stringify({
  timeZone: "Europe/Paris",
  exceptionLogging: "STACKDRIVER",
  runtimeVersion: "V8",
  oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  executionApi: { access: "MYSELF" },
})

type AppsScriptProject = { scriptId?: string }
type AppsScriptVersion = { versionNumber?: number }
type AppsScriptDeployment = { deploymentId?: string }
type AppsScriptExecution = {
  done?: boolean
  error?: { message?: string; details?: Array<{ errorMessage?: string }> }
  response?: { result?: unknown }
}

function executionError(execution: AppsScriptExecution) {
  if (!execution.error) return null
  return new Error(
    execution.error.details?.[0]?.errorMessage ||
      execution.error.message ||
      "APPS_SCRIPT_EXECUTION_FAILED",
  )
}

export type ClassImageScriptAction =
  | { action: "set"; row: number; url: string; title: string; note: string }
  | { action: "clear"; row: number }

class AppsScriptApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function appsScriptJson<T>(path: string, init?: RequestInit) {
  const response = await googleOAuthAuthorizedFetch(`${APPS_SCRIPT_API}/${path}`, init)
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T)
  if (!response.ok) {
    throw new AppsScriptApiError(
      response.status,
      payload.error?.message || `APPS_SCRIPT_API_ERROR:${response.status}`,
    )
  }
  return payload
}

async function getIntegration() {
  const [integration] = await getDb()
    .select()
    .from(googleAppsScriptIntegrations)
    .where(eq(googleAppsScriptIntegrations.key, INTEGRATION_KEY))
    .limit(1)
  return integration ?? null
}

async function saveIntegration(input: {
  spreadsheetId: string
  scriptId: string
  deploymentId?: string | null
  lastError?: string | null
  lastRunAt?: string | null
}) {
  const now = new Date().toISOString()
  await getDb()
    .insert(googleAppsScriptIntegrations)
    .values({
      key: INTEGRATION_KEY,
      spreadsheetId: input.spreadsheetId,
      scriptId: input.scriptId,
      deploymentId: input.deploymentId ?? null,
      lastError: input.lastError ?? null,
      lastRunAt: input.lastRunAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleAppsScriptIntegrations.key,
      set: {
        spreadsheetId: input.spreadsheetId,
        scriptId: input.scriptId,
        deploymentId: input.deploymentId ?? null,
        lastError: input.lastError ?? null,
        lastRunAt: input.lastRunAt ?? null,
        updatedAt: now,
      },
    })
  return getIntegration()
}

async function createScriptIntegration(spreadsheetId: string) {
  const project = await appsScriptJson<AppsScriptProject>("projects", {
    method: "POST",
    body: JSON.stringify({ title: "Eraser — images de classes" }),
  })
  if (!project.scriptId) throw new Error("APPS_SCRIPT_PROJECT_ID_MISSING")
  await saveIntegration({ spreadsheetId, scriptId: project.scriptId })
  return project.scriptId
}

async function installScriptContent(scriptId: string) {
  await appsScriptJson(`projects/${encodeURIComponent(scriptId)}/content`, {
    method: "PUT",
    body: JSON.stringify({
      files: [
        { name: "Code", type: "SERVER_JS", source: SCRIPT_SOURCE },
        { name: "appsscript", type: "JSON", source: SCRIPT_MANIFEST },
      ],
    }),
  })
}

function cloudProjectSetupError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("cloud platform project") ||
    message.includes("cloud project") ||
    message.includes("standard project") ||
    (error instanceof AppsScriptApiError && [400, 403].includes(error.status))
  )
}

async function deployScript(scriptId: string) {
  try {
    const version = await appsScriptJson<AppsScriptVersion>(
      `projects/${encodeURIComponent(scriptId)}/versions`,
      {
        method: "POST",
        body: JSON.stringify({ description: "Insertion native des images de classes" }),
      },
    )
    if (version.versionNumber === undefined) throw new Error("APPS_SCRIPT_VERSION_MISSING")
    const deployment = await appsScriptJson<AppsScriptDeployment>(
      `projects/${encodeURIComponent(scriptId)}/deployments`,
      {
        method: "POST",
        body: JSON.stringify({
          versionNumber: version.versionNumber,
          manifestFileName: "appsscript",
          description: "Eraser — images natives Google Sheets",
        }),
      },
    )
    if (!deployment.deploymentId) throw new Error("APPS_SCRIPT_DEPLOYMENT_ID_MISSING")
    return deployment.deploymentId
  } catch (error) {
    if (cloudProjectSetupError(error)) throw new Error(APPS_SCRIPT_CLOUD_PROJECT_REQUIRED)
    throw error
  }
}

async function ensureScriptIntegration(spreadsheetId: string) {
  let integration = await getIntegration()
  if (!integration || integration.spreadsheetId !== spreadsheetId) {
    const scriptId = await createScriptIntegration(spreadsheetId)
    integration = await saveIntegration({ spreadsheetId, scriptId })
  }
  if (!integration) throw new Error("APPS_SCRIPT_INTEGRATION_MISSING")

  if (!integration.deploymentId) {
    await installScriptContent(integration.scriptId)
    try {
      const deploymentId = await deployScript(integration.scriptId)
      integration = await saveIntegration({
        spreadsheetId,
        scriptId: integration.scriptId,
        deploymentId,
      })
    } catch (error) {
      await saveIntegration({
        spreadsheetId,
        scriptId: integration.scriptId,
        lastError: error instanceof Error ? error.message : "APPS_SCRIPT_DEPLOYMENT_FAILED",
      })
      throw error
    }
  }
  if (!integration?.deploymentId) throw new Error("APPS_SCRIPT_DEPLOYMENT_MISSING")
  return integration
}

async function runAppsScriptFunction(
  deploymentId: string,
  functionName: string,
  parameters: string[],
) {
  const execution = await appsScriptJson<AppsScriptExecution>(
    `scripts/${encodeURIComponent(deploymentId)}:run`,
    {
      method: "POST",
      body: JSON.stringify({ function: functionName, parameters }),
    },
  )
  const error = executionError(execution)
  if (error) throw error
  return execution.response?.result
}

function missingScriptFunction(error: unknown, functionName: string) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("script function not found") ||
    message.includes("function not found") ||
    message.includes(functionName.toLowerCase())
  )
}

async function redeployScriptIntegration(
  integration: NonNullable<Awaited<ReturnType<typeof getIntegration>>>,
) {
  await installScriptContent(integration.scriptId)
  const deploymentId = await deployScript(integration.scriptId)
  const updated = await saveIntegration({
    spreadsheetId: integration.spreadsheetId,
    scriptId: integration.scriptId,
    deploymentId,
  })
  if (!updated?.deploymentId) throw new Error("APPS_SCRIPT_DEPLOYMENT_MISSING")
  return updated
}

export async function readClassImagesWithAppsScript(input: {
  spreadsheetId: string
  tabName: string
  startRow: number
  rowCount: number
}) {
  let integration = await ensureScriptIntegration(input.spreadsheetId)
  const functionName = "readEraserClassImages"
  const parameters = [JSON.stringify(input)]

  try {
    const result = await runAppsScriptFunction(
      integration.deploymentId!,
      functionName,
      parameters,
    )
    return Array.isArray(result) ? result.map((value) => String(value || "")) : []
  } catch (error) {
    if (!missingScriptFunction(error, functionName)) throw error
    integration = await redeployScriptIntegration(integration)
    const result = await runAppsScriptFunction(
      integration.deploymentId!,
      functionName,
      parameters,
    )
    return Array.isArray(result) ? result.map((value) => String(value || "")) : []
  }
}

export async function applyClassImagesWithAppsScript(input: {
  spreadsheetId: string
  tabName: string
  rowCount: number
  actions: ClassImageScriptAction[]
}) {
  const integration = await ensureScriptIntegration(input.spreadsheetId)
  try {
    const execution = await appsScriptJson<AppsScriptExecution>(
      `scripts/${encodeURIComponent(integration.deploymentId!)}:run`,
      {
        method: "POST",
        body: JSON.stringify({
          function: "applyEraserClassImages",
          parameters: [JSON.stringify(input)],
        }),
      },
    )
    if (execution.error) {
      throw new Error(
        execution.error.details?.[0]?.errorMessage ||
          execution.error.message ||
          "APPS_SCRIPT_EXECUTION_FAILED",
      )
    }
    await saveIntegration({
      spreadsheetId: input.spreadsheetId,
      scriptId: integration.scriptId,
      deploymentId: integration.deploymentId,
      lastRunAt: new Date().toISOString(),
    })
    return execution.response?.result
  } catch (error) {
    const normalizedError = cloudProjectSetupError(error)
      ? new Error(APPS_SCRIPT_CLOUD_PROJECT_REQUIRED)
      : error
    const needsFreshDeployment =
      normalizedError instanceof Error &&
      normalizedError.message === APPS_SCRIPT_CLOUD_PROJECT_REQUIRED
    await saveIntegration({
      spreadsheetId: input.spreadsheetId,
      scriptId: integration.scriptId,
      deploymentId: needsFreshDeployment ? null : integration.deploymentId,
      lastError: normalizedError instanceof Error
        ? normalizedError.message
        : "APPS_SCRIPT_EXECUTION_FAILED",
      lastRunAt: integration.lastRunAt,
    })
    throw normalizedError
  }
}

export async function getClassImageScriptSetup() {
  const [integration, oauthSettings] = await Promise.all([
    getIntegration(),
    getGoogleOAuthSettings(),
  ])
  const projectNumber = oauthSettings?.clientId.match(/^(\d+)-/)?.[1] ?? ""
  if (!integration) return null
  return {
    scriptId: integration.scriptId,
    deploymentId: integration.deploymentId,
    lastError: integration.lastError,
    lastRunAt: integration.lastRunAt,
    projectNumber,
    editorUrl: `https://script.google.com/home/projects/${encodeURIComponent(integration.scriptId)}/edit`,
    settingsUrl: `https://script.google.com/home/projects/${encodeURIComponent(integration.scriptId)}/settings`,
  }
}
