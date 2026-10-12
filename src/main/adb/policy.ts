export const providers = {
  sms: "content://sms",
  mms: "content://mms",
  calls: "content://call_log/calls",
  contacts: "content://contacts/phones",
} as const;
export type Provider = keyof typeof providers;
export function providerCommand(name: Provider): string {
  return `content query --uri ${providers[name]}`;
}
export const probes = {
  properties: "getprop",
  identity: "id",
  root: "su -c 'id'",
  selinux: "getenforce",
  time: "date -u +%Y-%m-%dT%H:%M:%SZ",
  blocks: "su -c 'ls -1 /dev/block/by-name'",
} as const;
export function validBlock(path: string): boolean {
  return /^\/dev\/block\/(?:by-name\/[A-Za-z0-9_.-]+|mmcblk\d+(?:p\d+)?|sd[a-z](?:\d+)?|nvme\d+n\d+(?:p\d+)?)$/.test(
    path,
  );
}
export function physicalCommand(path: string, direct = false): string {
  if (!validBlock(path))
    throw new Error("Block path is not an allowed raw device.");
  const command = `dd if=${path} bs=1048576 2>/dev/null`;
  return direct ? command : `su -c '${command}'`;
}
export function sizeCommand(path: string, direct = false): string {
  if (!validBlock(path)) throw new Error("Invalid block device.");
  const command = `blockdev --getsize64 ${path}`;
  return direct ? command : `su -c '${command}'`;
}
export const externalCommand = "tar -cf - -C /sdcard .";
export const appCommands = [
  {
    name: "whatsapp",
    command:
      "su -c 'tar -cf - -C /data/user/0/com.whatsapp databases shared_prefs'",
  },
  {
    name: "telephony",
    command:
      "su -c 'tar -cf - -C /data/user/0/com.android.providers.telephony databases'",
  },
] as const;
export const allowedCommands = new Set<string>([
  ...Object.values(probes),
  ...Object.keys(providers).map((k) => providerCommand(k as Provider)),
  externalCommand,
  ...appCommands.map((c) => c.command),
]);
for (const command of [...appCommands.map((c) => c.command), probes.blocks])
  allowedCommands.add(command.slice(7, -1));
export function assertReadCommand(command: string): void {
  if (allowedCommands.has(command)) return;
  const match = /^su -c 'dd if=(.+) bs=1048576 2>\/dev\/null'$/.exec(command);
  if (match && physicalCommand(match[1]) === command) return;
  const size = /^su -c 'blockdev --getsize64 (.+)'$/.exec(command);
  if (size && sizeCommand(size[1]) === command) return;
  const direct = /^dd if=(.+) bs=1048576 2>\/dev\/null$/.exec(command);
  if (direct && physicalCommand(direct[1], true) === command) return;
  const directSize = /^blockdev --getsize64 (.+)$/.exec(command);
  if (directSize && sizeCommand(directSize[1], true) === command) return;
  throw new Error("Device write policy rejected this command.");
}
