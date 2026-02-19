/**
 * Provider-agnostic Messaging Gateway interface.
 *
 * TODO: Integrate a compliant telephony/messaging provider (e.g., a provider
 * that supports A2P 10DLC campaigns and has built-in DNC list checking).
 * The implementation should:
 * - Verify A2P campaign registration before sending
 * - Check DNC lists before outbound calls/SMS
 * - Store delivery receipts and call recordings (if applicable)
 * - Support opt-out keyword handling (STOP, UNSUBSCRIBE, etc.)
 */

export interface SendSmsRequest {
  to: string;
  from: string;
  body: string;
  campaignId?: string;
}

export interface MakeCallRequest {
  to: string;
  from: string;
  callbackUrl?: string;
}

export interface SendEmailRequest {
  to: string;
  from: string;
  subject: string;
  body: string;
}

export interface MessagingResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MessagingGateway {
  name: string;
  sendSms(request: SendSmsRequest): Promise<MessagingResult>;
  makeCall(request: MakeCallRequest): Promise<MessagingResult>;
  sendEmail(request: SendEmailRequest): Promise<MessagingResult>;
}
