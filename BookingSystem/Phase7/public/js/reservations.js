import { requireAuthOrBlockPage, initAuthUI, getTokenPayload } from "./auth-ui.js";

// Initialize UI
initAuthUI();

// Block page immediately if not logged in
if (!requireAuthOrBlockPage()) {
    throw new Error("Authentication required");
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("reservationForm");
    const reservationList = document.getElementById("reservationList");
    const formMessage = document.getElementById("formMessage");
    
    // Buttons
    const btnCreate = document.getElementById("btnCreate");
    const btnUpdate = document.getElementById("btnUpdate");
    const btnDelete = document.getElementById("btnDelete");
    const btnClear = document.getElementById("btnClear");

    // Inputs
    const idInput = document.getElementById("reservationId");
    const resourceIdInput = document.getElementById("resourceId");
    const userIdInput = document.getElementById("userId");
    const startTimeInput = document.getElementById("startTime");
    const endTimeInput = document.getElementById("endTime");
    const noteInput = document.getElementById("note");
    const statusInput = document.getElementById("status");

    // API Headers wrapper
    function getAuthHeaders() {
        const token = localStorage.getItem("token");
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };
    }

    function showMessage(type, text) {
        const styles = {
            success: "border-brand-green/30 bg-brand-green/10 text-brand-green",
            error: "border-brand-rose/30 bg-brand-rose/10 text-brand-rose",
        };
        formMessage.className = `mt-6 rounded-2xl border px-4 py-3 text-sm ${styles[type]}`;
        formMessage.textContent = text;
        formMessage.classList.remove("hidden");
        
        // Auto-hide success messages
        if (type === "success") {
            setTimeout(() => {
                formMessage.classList.add("hidden");
            }, 3000);
        }
    }

    function clearForm() {
        form.reset();
        idInput.value = "";
        btnCreate.classList.remove("hidden");
        btnUpdate.classList.add("hidden");
        btnDelete.classList.add("hidden");
        formMessage.classList.add("hidden");
        
        // Auto-fill current user ID
        const user = getTokenPayload();
        if (user) {
            userIdInput.value = user.sub || user.id || "";
        }
    }

    // --- API Calls ---

    async function fetchResourcesForDropdown() {
        try {
            const response = await fetch("/api/resources", {
                headers: getAuthHeaders()
            }); 
            
            if (!response.ok) throw new Error("Failed to fetch resources");
            
            const result = await response.json();
            const resourceSelect = document.getElementById("resourceId");
            
            // Extract the array from the { ok: true, data: [...] } format
            const resources = result.data || [];
            
            if (resources.length === 0) {
                resourceSelect.innerHTML = '<option value="" disabled selected>No resources available (Create one first)</option>';
                return;
            }

            resourceSelect.innerHTML = '<option value="" disabled selected>-- Choose a resource --</option>';
            
            resources.forEach(res => {
                const option = document.createElement("option");
                option.value = res.id;
                // Only active/available resources should be bookable ideally, but we show all here
                const statusText = res.available ? "" : " (Unavailable)";
                option.textContent = `${res.name} ${res.price > 0 ? `(€${res.price})` : ''} ${statusText}`;
                resourceSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Error loading resources for dropdown:", error);
            const resourceSelect = document.getElementById("resourceId");
            if (resourceSelect) {
                resourceSelect.innerHTML = '<option value="">Error loading resources</option>';
            }
        }
    }

    async function fetchReservations() {
        try {
            const response = await fetch("/api/reservations", {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) throw new Error("Failed to load reservations");
            
            const result = await response.json();
            const reservations = result.data || [];
            renderList(reservations);
        } catch (error) {
            console.error("Error fetching reservations:", error);
            reservationList.innerHTML = `<p class="text-sm text-brand-rose">Failed to load reservations.</p>`;
        }
    }

    async function saveReservation(method, url, payload) {
        try {
            const response = await fetch(url, {
                method: method,
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to save reservation");
            }

            showMessage("success", method === "POST" ? "Reservation created!" : "Reservation updated!");
            clearForm();
            fetchReservations();
        } catch (error) {
            showMessage("error", error.message);
        }
    }

    async function deleteReservation(id) {
        if (!confirm("Are you sure you want to delete this reservation?")) return;
        
        try {
            const response = await fetch(`/api/reservations/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });

            if (!response.ok) throw new Error("Failed to delete reservation");

            showMessage("success", "Reservation deleted!");
            clearForm();
            fetchReservations();
        } catch (error) {
            showMessage("error", error.message);
        }
    }

    // --- UI Rendering ---

    function renderList(reservations) {
        reservationList.innerHTML = "";
        
        if (reservations.length === 0) {
            reservationList.innerHTML = `<p class="text-sm text-black/50">No reservations found.</p>`;
            return;
        }

        reservations.forEach(res => {
            const item = document.createElement("div");
            item.className = "group cursor-pointer rounded-2xl border border-black/5 bg-white p-4 transition-all hover:border-brand-primary/30 hover:bg-brand-primary/5 hover:shadow-sm";
            
            const start = new Date(res.startTime).toLocaleString();
            const end = new Date(res.endTime).toLocaleString();
            
            // Use names returned from the backend JOIN if available, otherwise fallback to IDs
            const resourceName = res.resource_name || `Resource #${res.resource_id}`;
            const userEmail = res.user_email || `User #${res.user_id}`;

            item.innerHTML = `
                <div class="flex items-start justify-between">
                    <div>
                        <p class="font-semibold text-sm">${resourceName}</p>
                        <p class="mt-1 text-xs text-black/60">${start} - ${end}</p>
                        <p class="mt-1 text-xs text-black/60 italic">${res.note || 'No notes'} • By: ${userEmail}</p>
                    </div>
                    <span class="inline-flex rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-blue uppercase tracking-wider">
                        ${res.status}
                    </span>
                </div>
            `;
            
            item.addEventListener("click", () => loadIntoForm(res));
            reservationList.appendChild(item);
        });
    }

    function loadIntoForm(res) {
        idInput.value = res.id;
        // The backend returns resource_id and user_id due to snake_case column names
        resourceIdInput.value = res.resource_id || res.resourceId;
        userIdInput.value = res.user_id || res.userId;
        
        if (res.start_time || res.startTime) {
            const startDate = new Date(res.start_time || res.startTime);
            startTimeInput.value = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        }
        if (res.end_time || res.endTime) {
            const endDate = new Date(res.end_time || res.endTime);
            endTimeInput.value = new Date(endDate.getTime() - (endDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        }
        
        noteInput.value = res.note || "";
        statusInput.value = res.status || "active";

        btnCreate.classList.add("hidden");
        btnUpdate.classList.remove("hidden");
        btnDelete.classList.remove("hidden");
        
        formMessage.classList.add("hidden");
    }

    // --- Event Listeners ---

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const resourceId = parseInt(resourceIdInput.value);
        const userId = parseInt(userIdInput.value);
        
        if (isNaN(resourceId)) {
            return showMessage("error", "Please select a resource.");
        }
        if (isNaN(userId)) {
            return showMessage("error", "User ID is missing. Please log in again.");
        }

        const start = new Date(startTimeInput.value);
        const end = new Date(endTimeInput.value);

        const payload = {
            resourceId: resourceId,
            userId: userId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            note: noteInput.value,
            status: statusInput.value
        };

        const id = idInput.value;
        if (id) {
            saveReservation("PUT", `/api/reservations/${id}`, payload);
        } else {
            saveReservation("POST", "/api/reservations", payload);
        }
    });

    btnUpdate.addEventListener("click", () => {
        form.dispatchEvent(new Event("submit"));
    });

    btnDelete.addEventListener("click", () => {
        const id = idInput.value;
        if (id) deleteReservation(id);
    });

    btnClear.addEventListener("click", clearForm);

    // Initial load
    clearForm();
    fetchResourcesForDropdown();
    fetchReservations();
});