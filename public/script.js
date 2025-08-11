// Enregistre le Service Worker (doit être au début du script)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("Service Worker enregistré avec succès:", registration);
      })
      .catch((err) => {
        console.log("Échec de l'enregistrement du Service Worker:", err);
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // --- Éléments du DOM ---
  const transportForm = document.getElementById("transportForm");
  const transportTypeSelect = document.getElementById("transportType");
  const quantityInput = document.getElementById("quantity");
  const calculatedAmountSpan = document.getElementById("calculatedAmount");
  const totalAmountSummarySpan = document.getElementById("totalAmountSummary");
  const sacCountSpan = document.getElementById("sacCount");
  const balCountSpan = document.getElementById("balCount");
  const transportsTableBody = document.querySelector("#transportsTable tbody");
  const workerSelect = document.getElementById("workerSelect");
  const workersSummaryContainer = document.getElementById(
    "workersSummaryContainer"
  );
  const deleteAllBtn = document.getElementById("deleteAllBtn");

  // --- Données statiques des transporteurs et des prix ---
  const WORKERS = [
    { id: 1, name: "Bill" },
    { id: 2, name: "Petit" },
    { id: 3, name: "Charles" },
    { id: 4, name: "PetFre" },
    { id: 5, name: "GoodMan" },
    { id: 6, name: "Nani" },
  ];

  const PRICES = {
    sac: 500,
    bal: 2500,
  };

  // --- Fonctions utilitaires ---
  async function fetchAPI(url, method = "GET", body = null) {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(error.message);
    }

    return response.json();
  }

  function formatFCFA(amount) {
    if (typeof amount !== "number") {
      console.warn("formatFCFA a reçu une valeur non numérique:", amount);
      amount = parseFloat(amount) || 0;
    }
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
    })
      .format(amount)
      .replace("XOF", "FCFA");
  }

  // --- Gestion des transporteurs (maintenant statique) ---
  function populateWorkersSelect() {
    workerSelect.innerHTML = WORKERS.map(
      (worker) => `<option value="${worker.id}">${worker.name}</option>`
    ).join("");
  }

  // --- Gestion des transports ---
  async function addTransport() {
    const type = transportTypeSelect.value;
    const quantity = parseInt(quantityInput.value);
    const worker_id = parseInt(workerSelect.value);

    if (!type || isNaN(quantity) || quantity <= 0 || isNaN(worker_id)) {
      alert(
        "Veuillez sélectionner un transporteur, un type de transport et entrer une quantité valide."
      );
      return;
    }

    try {
      await fetchAPI("/api/transports", "POST", { type, quantity, worker_id });
      alert("Transport enregistré avec succès !");
      transportForm.reset();
      calculatedAmountSpan.textContent = "0 FCFA";
      fetchTransports();
      fetchSummary();
      fetchWorkersSummary();
    } catch (error) {
      alert(`Erreur lors de l'enregistrement du transport: ${error.message}`);
    }
  }

  async function deleteTransport(transportId) {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce transport ?")) {
      try {
        await fetchAPI(`/api/transports/${transportId}`, "DELETE");
        alert("Transport supprimé avec succès !");
        fetchTransports();
        fetchSummary();
        fetchWorkersSummary();
      } catch (error) {
        alert(`Erreur lors de la suppression du transport: ${error.message}`);
      }
    }
  }

  async function deleteAllTransports() {
    if (
      confirm(
        "Êtes-vous sûr de vouloir supprimer TOUT l'historique ? Cette action est irréversible."
      )
    ) {
      try {
        await fetchAPI(`/api/transports/all`, "DELETE");
        alert("Tout l'historique a été supprimé avec succès !");
        fetchTransports();
        fetchSummary();
        fetchWorkersSummary();
      } catch (error) {
        alert(
          `Erreur lors de la suppression de l'historique: ${error.message}`
        );
      }
    }
  }

  // --- Gestion des affichages ---
  async function fetchTransports() {
    try {
      const transports = await fetchAPI("/api/transports");
      transportsTableBody.innerHTML = "";
      transports.forEach((transport) => {
        const row = transportsTableBody.insertRow();
        row.innerHTML = `
                    <td data-label="Transporteur">${transport.worker_name}</td>
                    <td data-label="Type">${transport.type}</td>
                    <td data-label="Quantité">${transport.quantity}</td>
                    <td data-label="Montant">${formatFCFA(
                      transport.amount
                    )}</td>
                    <td data-label="Date">${new Date(
                      transport.timestamp
                    ).toLocaleDateString()}</td>
                    <td>
                        <button class="delete-btn" onclick="deleteTransport(${
                          transport.id
                        })">Supprimer</button>
                    </td>
                `;
      });
    } catch (error) {
      console.error(
        "Erreur lors du chargement de l'historique des transports:",
        error
      );
    }
  }

  async function fetchSummary() {
    try {
      const summary = await fetchAPI("/api/summary");
      totalAmountSummarySpan.textContent = formatFCFA(
        summary.total_amount || 0
      );
      sacCountSpan.textContent = summary.counts.sac || 0;
      balCountSpan.textContent = summary.counts.bal || 0;
    } catch (error) {
      console.error("Erreur lors du chargement du résumé:", error);
      totalAmountSummarySpan.textContent = "Erreur";
      sacCountSpan.textContent = "Erreur";
      balCountSpan.textContent = "Erreur";
    }
  }

  async function fetchWorkersSummary() {
    try {
      const summaries = await fetchAPI("/api/summary/by-worker");
      workersSummaryContainer.innerHTML = "";
      if (summaries.length === 0) {
        workersSummaryContainer.innerHTML =
          "<p>Aucun transport n'a encore été enregistré.</p>";
        return;
      }
      summaries.forEach((s) => {
        const card = document.createElement("div");
        card.classList.add("worker-summary-card");
        card.innerHTML = `
                    <h3>${s.worker_name}</h3>
                    <div class="summary-item">
                        <span>Montant total :</span>
                        <span class="highlight">${formatFCFA(
                          s.total_amount
                        )}</span>
                    </div>
                    <div class="summary-item">
                        <span>Total Sacs :</span>
                        <span class="highlight">${s.total_sacs}</span>
                    </div>
                    <div class="summary-item">
                        <span>Total Bals :</span>
                        <span class="highlight">${s.total_bals}</span>
                    </div>
                `;
        workersSummaryContainer.appendChild(card);
      });
    } catch (error) {
      console.error(
        "Erreur lors du chargement du résumé par transporteur:",
        error
      );
      workersSummaryContainer.innerHTML =
        "<p>Erreur de chargement du résumé.</p>";
    }
  }

  // --- Événements et initialisation ---
  transportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addTransport();
  });

  transportTypeSelect.addEventListener("change", updateCalculatedAmount);
  quantityInput.addEventListener("input", updateCalculatedAmount);

  deleteAllBtn.addEventListener("click", deleteAllTransports); // NOUVEL ÉVÉNEMENT

  function updateCalculatedAmount() {
    const type = transportTypeSelect.value;
    const quantity = parseInt(quantityInput.value);
    if (type && !isNaN(quantity) && quantity > 0) {
      const price = PRICES[type];
      calculatedAmountSpan.textContent = formatFCFA(price * quantity);
    } else {
      calculatedAmountSpan.textContent = "0 FCFA";
    }
  }

  // Rendre la fonction globale pour les boutons dans le tableau
  window.deleteTransport = deleteTransport;

  // Charger les données au démarrage
  populateWorkersSelect();
  fetchTransports();
  fetchSummary();
  fetchWorkersSummary();
});
