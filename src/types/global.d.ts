export {};

export interface PayHerePaymentObject {
  sandbox: boolean;
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  amount: string | number;
  currency: string;
  hash: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  custom_1?: string;
  custom_2?: string;
}

export interface PayHereSDK {
  startPayment: (paymentObj: PayHerePaymentObject) => void;
  onCompleted?: (orderId?: string) => void;
  onDismissed?: () => void;
  onError?: (error: unknown) => void;
}

declare global {
  interface Window {
    recaptchaVerifier?: unknown;
    payhere?: PayHereSDK;
  }
}
