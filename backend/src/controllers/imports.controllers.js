import { convertImportDraft, createImportDraft, getImportDraftResult } from "../services/imports.services.js";

export async function createImportDraftController(req, res) {
  const result = await createImportDraft(req.auth.sub, req.validatedImportDraft);
  return res.status(201).json(result);
}

export async function getImportDraftController(req, res) {
  const result = await getImportDraftResult(req.auth.sub, req.params.id);
  if (!result) return res.status(404).json({ message: "Import draft not found." });
  return res.status(200).json(result);
}

export async function convertImportDraftController(req, res) {
  const result = await convertImportDraft(req.auth.sub, req.params.id, req.validatedImportConversion);
  if (!result) return res.status(404).json({ message: "Import draft not found." });
  if (result.alreadyConverted) return res.status(409).json({ message: "Import draft already converted.", importDraft: result.importDraft });
  if (result.missingFields) {
    return res.status(400).json({ message: "Import draft is missing required fields.", fields: result.missingFields });
  }
  if (result.duplicateCandidates) {
    return res.status(409).json({ message: "Possible duplicate detected.", duplicates: result.duplicateCandidates });
  }
  return res.status(201).json(result);
}
