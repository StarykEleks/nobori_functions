gcloud pubsub topics add-iam-policy-binding jobs-topic \
--member="serviceAccount:67671928053-compute@developer.gserviceaccount.com" \
--role="roles/pubsub.publisher" \
--project=nobori-d1