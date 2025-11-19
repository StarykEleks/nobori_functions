PROJECT_ID=nobori-d1
  SA_EMAIL=nobori-apis@nobori-d1.iam.gserviceaccount.com
gcloud functions deploy visabilityCheck \
  --gen2 --runtime=nodejs20 \
  --region="europe-west1" --project="nobori-d1" \
  --source=. \
  --vpc-connector=nobori-connector \
  --egress-settings=private-ranges-only \
  --entry-point=visabilityCheck \
  --trigger-http --no-allow-unauthenticated \
  --set-env-vars=NODE_ENV=production \
  --service-account="$RUNTIME_SA"

  RUNTIME_SA="nobori-apis@nobori-d1.iam.gserviceaccount.com"
  gcloud projects add-iam-policy-binding nobori-d1 \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/firebaseanalytics.viewer"
#
#gcloud functions deploy workerPubsub \
#  --gen2 --runtime=nodejs20 \
#  --region="europe-west1" --project="nobori-d1" \
#  --source=. \
#  --entry-point=workerPubsub \
#  --trigger-topic="jobs-topic" \
#  --service-account="$RUNTIME_SA" \
#  --set-env-vars=NODE_ENV=production
#
gcloud pubsub subscriptions create visabilityCheckSubscription \
  --topic=jobs-topic \
  --ack-deadline=600 \
  --push-endpoint=https://europe-west1-nobori-l1.cloudfunctions.net/visabilityCheck \
  --push-auth-service-account=tasks-invoker@nobori-l1.iam.gserviceaccount.com \
  --push-auth-token-audience=https://europe-west1-nobori-l1.cloudfunctions.net/visabilityCheck

# Deploy the promptScheduler function
function prompt_scheduler() {
  echo "Deploying promptScheduler function..."
  PROJECT_ID=nobori-l1
  SA_EMAIL=nobori-apis@nobori-l1.iam.gserviceaccount.com

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/cloudsql.client"

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/cloudsql.instanceUser"

  gcloud functions deploy promptScheduler \
    --region=europe-west1 \
    --runtime=nodejs20 \
    --trigger-http \
    --gen2 \
    --source=. \
    --entry-point=promptScheduler \
    --service-account="$SA_EMAIL" \
    --timeout=120s

  echo "Updating Cloud Scheduler job for promptScheduler..."

  gcloud scheduler jobs create http promptScheduler \
    --schedule="*/10 * * * *" \
    --time-zone="Europe/Paris" \
    --uri="https://europe-west1-nobori-l1.cloudfunctions.net/promptScheduler" \
    --http-method=GET \
    --oidc-service-account-email="nobori-l1@appspot.gserviceaccount.com" \
    --oidc-token-audience="https://europe-west1-nobori-l1.cloudfunctions.net/promptScheduler" \
    --attempt-deadline=60s

  echo "promptScheduler function deployed and scheduled successfully."
}

# Call the function to deploy
if [[ "$1" == "deploy-prompt-scheduler" ]]; then
  deploy_prompt_scheduler
fi


PROJECT_ID=nobori-d1
RUNTIME_SA="nobori-apis@${PROJECT_ID}.iam.gserviceaccount.com"
APPENGINE_SA="${PROJECT_ID}@appspot.gserviceaccount.com"


gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/pubsub.publisher"

#gcloud projects add-iam-policy-binding $PROJECT_ID \
#  --member="serviceAccount:${RUNTIME_SA}" \
#  --role="roles/firebaseremoteconfig.admin"
#
#gcloud projects add-iam-policy-binding $PROJECT_ID \
#  --member="serviceAccount:${APPENGINE_SA}" \
#  --role="roles/firebaseremoteconfig.admin"
#
#gcloud projects add-iam-policy-binding $PROJECT_ID \
#  --member="serviceAccount:${RUNTIME_SA}" \
#  --role="roles/firebaseanalytics.viewer"
#
#gcloud projects add-iam-policy-binding $PROJECT_ID \
#  --member="serviceAccount:${APPENGINE_SA}" \
#  --role="roles/firebaseanalytics.viewer"

gcloud pubsub topics create YOUR_TOPIC_NAME
