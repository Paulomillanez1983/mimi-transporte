const supabase = window.supabase.createClient(
  "https://xrphpqmutvadjrucqicn.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM"
);

const API_URL = "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/admin-review-driver";

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function loadDrivers() {
  const { data } = await supabase
    .from("driver_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const container = document.getElementById("drivers");
  container.innerHTML = "";

  data.forEach(driver => {
    const div = document.createElement("div");
    div.className = "driver";

    div.innerHTML = `
      <h3>${driver.user_id}</h3>
      <p>Status: ${driver.onboarding_status}</p>
      <textarea placeholder="Notas" id="note-${driver.user_id}"></textarea>
      <br/>
      <button onclick="review('${driver.user_id}', 'approve')">Aprobar</button>
      <button onclick="review('${driver.user_id}', 'reject')">Rechazar</button>
      <button onclick="review('${driver.user_id}', 'block')">Bloquear</button>
    `;

    container.appendChild(div);
  });
}

async function review(driverId, action) {
  const session = await getSession();
  const note = document.getElementById(`note-${driverId}`).value;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + session.access_token
    },
    body: JSON.stringify({
      driver_user_id: driverId,
      action,
      review_notes: note
    })
  });

  const data = await res.json();
  alert(JSON.stringify(data));

  loadDrivers();
}

document.getElementById("logout").onclick = async () => {
  await supabase.auth.signOut();
  window.location.href = "admin-login.html";
};

loadDrivers();
