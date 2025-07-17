// Enregistre le Service Worker
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
  // Éléments du formulaire d'enregistrement de transport
  const transportTypeSelect = document.getElementById("transportType");
  const quantityInput = document.getElementById("quantity");
  const calculatedAmountSpan = document.getElementById("calculatedAmount");
  const addTransportBtn = document.getElementById("addTransportBtn");

  // Éléments d'affichage des données
  const totalAmountSummarySpan = document.getElementById("totalAmountSummary");
  const transportsTableBody = document.querySelector("#transportsTable tbody");

  // --- Définition des prix (doit correspondre à ceux du backend pour la cohérence de l'estimation) ---
  const PRICES = {
    sac: 500,
    bal: 2500,
  };

  // --- Fonctions utilitaires ---

  // Formate un montant en FCFA
  function formatFCFA(amount) {
    if (typeof amount !== "number" || isNaN(amount)) {
      console.warn("formatFCFA a reçu une valeur non numérique:", amount); // Ajout d'un warning
      return "0 FCFA";
    }
    return amount.toLocaleString("fr-FR") + " FCFA";
  }

  // Effectue des requêtes API génériques
  async function fetchAPI(url, method = "GET", body = null) {
    try {
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
        const errorData = await response.json();
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`);
      }
      // Certaines requêtes DELETE peuvent ne pas retourner de JSON
      if (response.headers.get("content-type")?.includes("application/json")) {
        return response.json();
      }
      return response.text(); // Ou return response pour les cas sans JSON
    } catch (error) {
      console.error(`Erreur lors de la requête ${method} ${url}:`, error);
      throw error; // Propager l'erreur pour un traitement ultérieur
    }
  }

  // --- Gestion des transports ---

  // Met à jour l'affichage du montant estimé dans le formulaire
  function updateCalculatedAmount() {
    const type = transportTypeSelect.value;
    const quantity = parseInt(quantityInput.value);

    // Vérifie si le type est valide, la quantité est un nombre positif et le prix existe
    if (type && !isNaN(quantity) && quantity > 0 && PRICES[type]) {
      const amount = quantity * PRICES[type];
      calculatedAmountSpan.textContent = formatFCFA(amount);
      addTransportBtn.disabled = false; // Active le bouton si valide
    } else {
      calculatedAmountSpan.textContent = "0 FCFA";
      addTransportBtn.disabled = true; // Désactive le bouton si invalide
    }
  }

  // Enregistre un nouveau transport via l'API
  async function addTransport() {
    const type = transportTypeSelect.value;
    const quantity = parseInt(quantityInput.value);

    // Re-validation avant l'envoi au cas où le bouton serait activé par erreur
    if (!type || isNaN(quantity) || quantity <= 0 || !PRICES[type]) {
      alert(
        "Veuillez sélectionner un type de transport et entrer une quantité valide."
      );
      return;
    }

    try {
      // Envoi seulement le type et la quantité, le backend calcule le montant
      await fetchAPI("/api/transports", "POST", { type, quantity });
      alert("Transport enregistré avec succès !");
      // Réinitialiser le formulaire
      transportTypeSelect.value = "";
      quantityInput.value = "1";
      updateCalculatedAmount(); // Réinitialise l'affichage du montant
      // Mettre à jour les listes
      fetchTransports();
      fetchSummary();
    } catch (error) {
      alert(`Erreur lors de l'enregistrement du transport: ${error.message}`);
    }
  }

  // Supprime un transport via l'API
  async function deleteTransport(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce transport ?")) {
      try {
        await fetchAPI(`/api/transports/${id}`, "DELETE");
        alert("Transport supprimé !");
        fetchTransports(); // Rafraîchir l'historique
        fetchSummary(); // Rafraîchir le résumé
      } catch (error) {
        alert(`Erreur lors de la suppression du transport: ${error.message}`);
      }
    }
  }

  // Charge et affiche l'historique de tous les transports
  async function fetchTransports() {
    try {
      const transports = await fetchAPI("/api/transports");
      transportsTableBody.innerHTML = ""; // Vide le tableau avant de le remplir

      if (transports.length === 0) {
        transportsTableBody.innerHTML =
          '<tr><td colspan="5">Aucun transport enregistré.</td></tr>';
        return;
      }

      transports.forEach((t) => {
        const row = transportsTableBody.insertRow();
        // Utilisation de data-label pour le responsive (CSS)
        row.insertCell().setAttribute("data-label", "Date:");
        row.cells[0].textContent = new Date(t.timestamp).toLocaleString(
          "fr-FR"
        );
        row.insertCell().setAttribute("data-label", "Type:");
        row.cells[1].textContent = t.type === "sac" ? "Sac" : "Bal"; // Affichage lisible
        row.insertCell().setAttribute("data-label", "Qté:");
        row.cells[2].textContent = t.quantity;
        row.insertCell().setAttribute("data-label", "Montant:");
        row.cells[3].textContent = formatFCFA(t.amount);

        const actionCell = row.insertCell();
        actionCell.setAttribute("data-label", "Action:");
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Supprimer";
        deleteBtn.classList.add("delete-btn");
        deleteBtn.addEventListener("click", () => deleteTransport(t.id));
        actionCell.appendChild(deleteBtn);
      });
    } catch (error) {
      console.error(
        "Erreur lors du chargement de l'historique des transports:",
        error
      );
      transportsTableBody.innerHTML =
        '<tr><td colspan="5">Erreur de chargement de l\'historique.</td></tr>';
    }
  }

  // Charge et affiche le montant total dû au travailleur
  async function fetchSummary() {
    try {
      const summary = await fetchAPI("/api/summary");

      totalAmountSummarySpan.textContent = formatFCFA(
        summary.total_amount || 0
      );
    } catch (error) {
      console.error("Erreur lors du chargement du résumé:", error);
      totalAmountSummarySpan.textContent = "Erreur";
    }
  }

  // --- Écouteurs d'événements ---

  // Écoute les changements sur le type de transport et la quantité pour mettre à jour le montant estimé
  transportTypeSelect.addEventListener("change", updateCalculatedAmount);
  quantityInput.addEventListener("input", updateCalculatedAmount);

  // Écoute le clic sur le bouton "Enregistrer Transport"
  addTransportBtn.addEventListener("click", addTransport);

  // --- Initialisation de l'application au chargement de la page ---
  updateCalculatedAmount(); // Appelle une première fois pour initialiser l'affichage et l'état du bouton
  fetchTransports(); // Charge l'historique des transports
  fetchSummary(); // Charge le résumé du montant total
});
