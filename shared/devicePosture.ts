import type { CredentialReport, DevicePosture } from "./types";

const NOT_REPORTED = "not reported";

export function reportedFact(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return NOT_REPORTED;
  return trimmed;
}

export function describeEncryption(state: string, type: string): string {
  const crypto = state.trim().toLowerCase();
  const kind = type.trim().toLowerCase();
  if (!crypto) return NOT_REPORTED;
  if (crypto === "unencrypted") return "unencrypted";
  if (crypto === "encrypted" && (kind === "file" || kind === "block")) return `encrypted (${kind})`;
  if (crypto === "encrypted") return "encrypted";
  return reportedFact(state);
}

export function describeCredential(lockSettings: string): CredentialReport {
  const findings: CredentialReport[] = [];
  for (const match of lockSettings.matchAll(/credential\s*type\s*[:=]\s*([A-Za-z0-9_-]+)/gi)) {
    findings.push(credentialToken(match[1]));
  }
  for (const match of lockSettings.matchAll(/mCredentialType\s*=\s*(-?\d+)/gi)) {
    findings.push(credentialToken(match[1]));
  }
  for (const match of lockSettings.matchAll(/credential\s+enabled\s*[:=]\s*(true|false)/gi)) {
    findings.push(match[1].toLowerCase() === "true" ? "set" : "not set");
  }
  if (findings.includes("set")) return "set";
  if (findings.includes("not set")) return "not set";
  return "not reported";
}

function credentialToken(token: string): CredentialReport {
  const value = token.trim().toLowerCase();
  if (value === "none" || value === "false") return "not set";
  if (value === "pattern" || value === "pin" || value === "password" || value === "true") return "set";
  if (/^-?\d+$/.test(value)) {
    const number = Number(value);
    if (number > 0) return "set";
    if (number === 0 || number === -1) return "not set";
  }
  return "not reported";
}

export function buildDevicePosture(input: {
  serial: string;
  model: string;
  android: string;
  securityPatch: string;
  cryptoState: string;
  cryptoType: string;
  lockSettings: string;
}): DevicePosture {
  return {
    serial: input.serial,
    model: reportedFact(input.model),
    android: reportedFact(input.android),
    securityPatch: reportedFact(input.securityPatch),
    encryption: describeEncryption(input.cryptoState, input.cryptoType),
    credential: describeCredential(input.lockSettings),
  };
}
