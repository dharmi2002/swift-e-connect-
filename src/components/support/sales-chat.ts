export const supportPhone = (import.meta.env["VITE_SUPPORT_PHONE"] || "").trim();

export function supportEscalationReply() {
  if (supportPhone)
    return `I’m not able to resolve that here. Please call eLango support at ${supportPhone}.`;
  return "I’m not able to resolve that here. The support phone number is not configured yet; please email hello@elango.africa and the team will help you.";
}

export function getSalesChatReply(message: string) {
  const query = message.trim().toLowerCase();
  if (!query) return "Tell me where you are going and how long you need data for.";
  if (/password|secret|otp|code|card number|cvv|bank|payment details/.test(query)) {
    return "For your security, I cannot collect passwords, OTPs, card details, or account secrets. Use the secure checkout or sign in through the account page.";
  }
  if (/business|team|employee|company|bulk|multiple|many esim|share/.test(query)) {
    return "For a team, create a business account to buy multiple eSIMs, invite employees, assign lines, monitor usage, suspend access, and top up eligible lines. Open Business account to get started.";
  }
  if (
    /device|iphone|ipad|android|compatible|install|qr|scan|esim|e-sim|take esim|supports esim|phone can/.test(
      query,
    )
  ) {
    return "Check three things: your phone model must support eSIM, it must be carrier-unlocked, and its regional variant must allow eSIM. On iPhone, look for Settings > Cellular/Mobile Service > Add eSIM. On Android, look under Settings > Connections or Network & internet > SIMs for Add eSIM. You can also dial *#06# and look for an EID. Use Check device before buying; after purchase, scan the QR code we email you.";
  }
  if (
    /kenya|nigeria|south africa|ghana|egypt|morocco|uae|dubai|africa|east africa|west africa/.test(
      query,
    )
  ) {
    return "We have local African plans plus East Africa, West Africa, and Pan-Africa options. I can take you to the plan catalog so you can compare price, validity, and networks.";
  }
  if (/price|cost|how much|cheap|pricing|plan|data|gb|valid/.test(query)) {
    return "Plans show the exact data allowance, validity, networks, USD price, and local price before checkout. Browse the African catalog and choose the smallest plan that fits your trip.";
  }
  if (/refund|cancel|human|agent|support|help|problem|issue/.test(query)) {
    return supportEscalationReply();
  }
  return `${supportEscalationReply()} I can still help you choose a plan if you share your destination and trip length.`;
}
