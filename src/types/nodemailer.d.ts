declare module "nodemailer" {
  type TransportConfig = Record<string, unknown>;
  type SendMailPayload = {
    from?: string;
    to: string;
    subject: string;
    html: string;
  };
  type SendMailResult = {
    messageId?: string;
    response?: string;
    accepted?: string[];
    rejected?: string[];
    pending?: string[];
  };
  type Transporter = {
    verify: () => Promise<boolean>;
    sendMail: (payload: SendMailPayload) => Promise<SendMailResult>;
  };

  const nodemailer: {
    createTransport: (config: TransportConfig) => Transporter;
  };

  export default nodemailer;
}

