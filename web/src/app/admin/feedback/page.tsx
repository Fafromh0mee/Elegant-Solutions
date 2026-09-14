import { FeedbackClient } from "./feedback-client";
import {
  getContactMessagesAction,
  getSurveyResponsesAction,
} from "@/actions/feedback";

export default async function AdminFeedbackPage() {
  const [contactRes, surveyRes] = await Promise.all([
    getContactMessagesAction(),
    getSurveyResponsesAction(),
  ]);

  return (
    <FeedbackClient
      initialMessages={contactRes.messages}
      initialResponses={surveyRes.responses}
      initialAverages={surveyRes.averages}
      initialTotal={surveyRes.total}
    />
  );
}
