export function getSalesChatReply(message: string) {
  const query = message.trim().toLowerCase();
  if (!query) return "Tell me where you are going and how long you need data for.";
  if (/password|secret|otp|code|card number|cvv|bank|payment details/.test(query)) {
    return "For your security, I cannot collect passwords, OTPs, card details, or account secrets. Use the secure checkout or sign in through the account page.";
  }
  if (/business|team|employee|company|bulk|multiple|many esim|share/.test(query)) {
    return "For a team, create a business account to buy multiple eSIMs, invite employees, assign lines, monitor usage, suspend access, and top up eligible lines. Open Business account to get started.";
  }
  if (/device|iphone|ipad|android|compatible|install|qr|scan/.test(query)) {
    return "eLango delivers a QR code and activation details by email. Use Check device before buying, then follow the iOS or Android installation guide after payment.";
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
    return "I can help choose a plan and explain the buying flow. I cannot inspect orders or issue refunds; use the account area or the contact channel listed in the support section for account-specific help.";
  }
  return "I’m the eLango AI sales assistant. Tell me your destination, trip length, data need, or whether you are buying for a team, and I’ll point you to the fastest next step.";
}
