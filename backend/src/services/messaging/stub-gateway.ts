import {
  MessagingGateway,
  MessagingResult,
  SendSmsRequest,
  MakeCallRequest,
  SendEmailRequest,
} from "./interface";

/**
 * Stub messaging gateway that logs actions but does not send real messages.
 *
 * TODO: Replace with a real compliant telephony provider integration.
 * Ensure the provider:
 * - Supports A2P 10DLC for SMS
 * - Provides built-in DNC list management
 * - Handles opt-out keywords automatically
 * - Stores delivery/read receipts
 */
export class StubMessagingGateway implements MessagingGateway {
  name = "stub";

  async sendSms(request: SendSmsRequest): Promise<MessagingResult> {
    console.log("[StubGateway] SMS would be sent:", {
      to: request.to,
      from: request.from,
      bodyLength: request.body.length,
      campaignId: request.campaignId,
    });

    return {
      success: true,
      messageId: `stub-sms-${Date.now()}`,
    };
  }

  async makeCall(request: MakeCallRequest): Promise<MessagingResult> {
    console.log("[StubGateway] Call would be placed:", {
      to: request.to,
      from: request.from,
    });

    return {
      success: true,
      messageId: `stub-call-${Date.now()}`,
    };
  }

  async sendEmail(request: SendEmailRequest): Promise<MessagingResult> {
    console.log("[StubGateway] Email would be sent:", {
      to: request.to,
      from: request.from,
      subject: request.subject,
    });

    return {
      success: true,
      messageId: `stub-email-${Date.now()}`,
    };
  }
}
