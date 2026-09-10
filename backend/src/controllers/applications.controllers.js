import {
  createApplication,
  deleteApplication,
  deleteApplicationHistoryEvent,
  getApplication,
  getApplicationHistory,
  listApplicationHistories,
  listApplications,
  setApplicationResume,
  transitionApplicationStatus,
  updateApplication,
} from "../services/applications.services.js";

export async function listApplicationsController(req, res) {
  const data = await listApplications(req.auth.sub, req.query);
  return res.status(200).json({ applications: data });
}

export async function listApplicationHistoriesController(req, res) {
  const historyByApp = await listApplicationHistories(req.auth.sub);
  return res.status(200).json({ historyByApp });
}

export async function getApplicationController(req, res) {
  const data = await getApplication(req.auth.sub, req.params.id);
  if (!data) return res.status(404).json({ message: "Application not found." });
  return res.status(200).json({ application: data });
}

export async function getApplicationHistoryController(req, res) {
  const data = await getApplicationHistory(req.auth.sub, req.params.id);
  if (!data) return res.status(404).json({ message: "Application not found." });
  return res.status(200).json({ history: data });
}

export async function deleteApplicationHistoryEventController(req, res) {
  const deleted = await deleteApplicationHistoryEvent(req.auth.sub, req.params.id, req.params.activityLogId);
  if (!deleted) return res.status(404).json({ message: "History event not found." });
  return res.status(204).send();
}

export async function createApplicationController(req, res) {
  const result = await createApplication(req.auth.sub, req.validatedApplication);
  if (result.duplicateCandidates) {
    return res.status(409).json({ message: "Possible duplicate detected.", duplicates: result.duplicateCandidates });
  }
  return res.status(201).json(result);
}

export async function updateApplicationController(req, res) {
  const result = await updateApplication(req.auth.sub, req.params.id, req.validatedApplication);
  if (!result) return res.status(404).json({ message: "Application not found." });
  if (result.duplicateCandidates) {
    return res.status(409).json({ message: "Possible duplicate detected.", duplicates: result.duplicateCandidates });
  }
  return res.status(200).json(result);
}

export async function transitionApplicationStatusController(req, res) {
  const result = await transitionApplicationStatus(req.auth.sub, req.params.id, req.validatedStatusTransition.status);
  if (!result) return res.status(404).json({ message: "Application not found." });
  return res.status(200).json(result);
}

export async function setApplicationResumeController(req, res) {
  const result = await setApplicationResume(
    req.auth.sub,
    req.params.id,
    req.validatedResumeAssociation.resumeVersionId,
  );
  if (!result) return res.status(404).json({ message: "Application not found." });
  return res.status(200).json(result);
}

export async function deleteApplicationController(req, res) {
  const deleted = await deleteApplication(req.auth.sub, req.params.id);
  if (!deleted) return res.status(404).json({ message: "Application not found." });
  return res.status(204).send();
}
