function resultSuccess(data) {
  return { success: true, data };
}

function resultError(issues) {
  return { success: false, error: { issues } };
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const signupSchema = {
  safeParse(input = {}) {
    const issues = [];
    const data = {};

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) issues.push({ path: ["name"], message: "Name cannot be empty." });
      if (name.length > 100) issues.push({ path: ["name"], message: "Name must be 100 characters or less." });
      data.name = name;
    }

    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) issues.push({ path: ["email"], message: "Email must be valid." });
    data.email = email;

    const password = String(input.password ?? "");
    if (password.length < 8) issues.push({ path: ["password"], message: "Password must be at least 8 characters." });
    data.password = password;

    return issues.length ? resultError(issues) : resultSuccess(data);
  },
};

export const loginSchema = {
  safeParse(input = {}) {
    const issues = [];
    const email = normalizeEmail(input.email);
    const password = String(input.password ?? "");

    if (!isValidEmail(email)) issues.push({ path: ["email"], message: "Email must be valid." });
    if (!password) issues.push({ path: ["password"], message: "Password is required." });

    return issues.length ? resultError(issues) : resultSuccess({ email, password });
  },
};

export const emailSchema = {
  safeParse(input = {}) {
    const email = normalizeEmail(input.email);
    return isValidEmail(email)
      ? resultSuccess({ email })
      : resultError([{ path: ["email"], message: "Email must be valid." }]);
  },
};

export const tokenSchema = {
  safeParse(input = {}) {
    const token = String(input.token ?? "");
    return token.length >= 32 && token.length <= 256
      ? resultSuccess({ token })
      : resultError([{ path: ["token"], message: "A valid token is required." }]);
  },
};

export const passwordResetSchema = {
  safeParse(input = {}) {
    const token = String(input.token ?? "");
    const newPassword = String(input.newPassword ?? "");
    const issues = [];
    if (token.length < 32 || token.length > 256) issues.push({ path: ["token"], message: "A valid token is required." });
    if (newPassword.length < 8) issues.push({ path: ["newPassword"], message: "New password must be at least 8 characters." });
    return issues.length ? resultError(issues) : resultSuccess({ token, newPassword });
  },
};

export const extensionRefreshSchema = {
  safeParse(input = {}) {
    const refreshToken = String(input.refreshToken ?? "");
    if (!refreshToken || refreshToken.length > 256) {
      return resultError([{ path: ["refreshToken"], message: "A valid refresh token is required." }]);
    }
    return resultSuccess({ refreshToken });
  },
};

export const profileSchema = {
  safeParse(input = {}) {
    const issues = [];
    const data = {};

    if (input.name === undefined && input.email === undefined) {
      issues.push({ path: [], message: "Name or email is required." });
    }

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) issues.push({ path: ["name"], message: "Name cannot be empty." });
      if (name.length > 100) issues.push({ path: ["name"], message: "Name must be 100 characters or less." });
      data.name = name;
    }

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) issues.push({ path: ["email"], message: "Email must be valid." });
      data.email = email;
    }

    return issues.length ? resultError(issues) : resultSuccess(data);
  },
};

export const passwordChangeSchema = {
  safeParse(input = {}) {
    const issues = [];
    const currentPassword = String(input.currentPassword ?? "");
    const newPassword = String(input.newPassword ?? "");

    if (!currentPassword) issues.push({ path: ["currentPassword"], message: "Current password is required." });
    if (newPassword.length < 8) issues.push({ path: ["newPassword"], message: "New password must be at least 8 characters." });
    if (currentPassword && currentPassword === newPassword) {
      issues.push({ path: ["newPassword"], message: "New password must be different from the current password." });
    }

    return issues.length
      ? resultError(issues)
      : resultSuccess({ currentPassword, newPassword });
  },
};

export const deleteAccountSchema = {
  safeParse(input = {}) {
    const password = String(input.password ?? "");
    if (!password) {
      return resultError([{ path: ["password"], message: "Password is required." }]);
    }
    return resultSuccess({ password });
  },
};
