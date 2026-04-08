// js/onboarding-progress.js

export function countCompletedRequiredDocs(requiredDocs, getChosenFile) {
  return requiredDocs.filter((docType) => !!getChosenFile(docType)).length;
}

export function getDocumentsProgress(requiredDocs, getChosenFile) {
  const completed = countCompletedRequiredDocs(requiredDocs, getChosenFile);
  const total = requiredDocs.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    completed,
    total,
    pct,
    isComplete: completed >= total
  };
}

export function isProfileStepComplete(getField) {
  return !!(
    getField("full_name") &&
    getField("phone") &&
    getField("dni_number")
  );
}

export function isVehicleStepComplete(getField) {
  return !!(
    getField("vehicle_brand") &&
    getField("vehicle_model") &&
    getField("vehicle_year") &&
    getField("vehicle_color") &&
    getField("vehicle_plate")
  );
}

export function getOverallOnboardingState({ getField, requiredDocs, getChosenFile }) {
  const profileComplete = isProfileStepComplete(getField);
  const vehicleComplete = isVehicleStepComplete(getField);
  const docsProgress = getDocumentsProgress(requiredDocs, getChosenFile);

  return {
    profileComplete,
    vehicleComplete,
    docsProgress
  };
}
