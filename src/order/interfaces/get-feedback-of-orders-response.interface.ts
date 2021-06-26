import { IFeedback } from './feedback.interface';
export class IGetFeedbackOfOrders {
  status: number;
  message: string;
  data: {
    feedbacks: IFeedback[];
  };
}
