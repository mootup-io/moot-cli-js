export const PROFILE_RE = /^[a-z0-9_-]+$/;

export function validateProfile(profile: string): void {
  if (!PROFILE_RE.test(profile)) {
    throw new Error(
      `invalid profile name '${profile}' (must match ${PROFILE_RE})`,
    );
  }
}
