export function notFoundHandler(_req, res) {
  return res.status(404).json({ message: "Route not found." });
}

export function errorHandler(error, _req, res, _next) {
  const status = Number(error?.status) || 500;
  const payload = {
    message: status >= 500 ? "Internal server error." : error.message || "Request failed.",
  };

  if (error?.details) {
    payload.details = error.details;
  }

  if (error?.code && status < 500) {
    payload.code = error.code;
  }

  return res.status(status).json(payload);
}
