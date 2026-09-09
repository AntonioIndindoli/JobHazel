import {
  completeResumeUpload,
  createResumeDownloadUrl,
  initiateResumeUpload,
  listResumes,
  updateResume,
} from "../services/resumes.services.js";

export async function listResumesController(req, res) {
  const resumes = await listResumes(req.auth.sub, req.validatedResumeListQuery);
  return res.status(200).json({ resumes });
}

export async function initiateResumeUploadController(req, res) {
  const result = await initiateResumeUpload(req.auth.sub, req.body);
  return res.status(201).json(result);
}

export async function completeResumeUploadController(req, res) {
  const resume = await completeResumeUpload(req.auth.sub, req.params.id);
  return res.status(200).json({ resume });
}

export async function createResumeDownloadUrlController(req, res) {
  const result = await createResumeDownloadUrl(req.auth.sub, req.params.id);
  return res.status(200).json(result);
}

export async function updateResumeController(req, res) {
  const resume = await updateResume(req.auth.sub, req.params.id, req.body);
  return res.status(200).json({ resume });
}
