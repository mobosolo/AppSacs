const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Middleware pour parser les requêtes JSON

// --- Configuration de la base de données PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Important pour Render en production (certificat auto-signé)
  },
});

// Événements de connexion à la base de données
pool.on("connect", () => {
  console.log("Connecté à la base de données PostgreSQL.");
});
pool.on("error", (err) => {
  console.error("Erreur de connexion à la base de données:", err);
});

// --- Définition des prix de transport (constantes) ---
const PRICES = {
  sac: 500, // 500 FCFA par sac
  bal: 2500, // 2500 FCFA par bal
};

// --- Création de la table 'transports' si elle n'existe pas ---
async function createTransportsTable() {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS transports (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL, -- 'sac' ou 'bal'
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                amount INTEGER NOT NULL CHECK (amount > 0), -- Montant calculé
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
    console.log('Table "transports" prête ou déjà existante.');
    // Si tu avais une ancienne version avec worker_id et que tu veux la supprimer,
    // tu peux DÉCOMMENTER la ligne ci-dessous APRÈS la première exécution du serveur,
    // mais cela supprimera la colonne et ses données associées.
    // ATTENTION : À n'utiliser qu'une fois si nécessaire, et avec prudence.
    // await pool.query(`
    //     ALTER TABLE transports DROP COLUMN IF EXISTS worker_id;
    // `);
    // console.log('Colonne worker_id supprimée de la table transports (si existante).');
  } catch (err) {
    console.error('Erreur lors de la création de la table "transports":', err);
  }
}

createTransportsTable(); // Appelle cette fonction au démarrage du serveur

// --- Servir les fichiers statiques (Frontend) pour le test LOCAL ---
// Garde cette ligne pour le test local (http://localhost:3000).
// POUR LE DÉPLOIEMENT SUR RENDER, COMMENTE OU SUPPRIME CETTE LIGNE !
// app.use(express.static(path.join(__dirname, "public")));

// --- Routes API ---

// Route pour ajouter un transport
app.post("/api/transports", async (req, res) => {
  const { type, quantity } = req.body; // Le montant n'est pas envoyé par le client

  // Validations
  if (!type || !quantity) {
    return res
      .status(400)
      .json({ message: "Le type et la quantité sont requis." });
  }
  if (type !== "sac" && type !== "bal") {
    return res.status(400).json({
      message: 'Type de transport invalide. Doit être "sac" ou "bal".',
    });
  }
  if (typeof quantity !== "number" || quantity <= 0) {
    return res
      .status(400)
      .json({ message: "Quantité invalide. Doit être un nombre positif." });
  }

  // Calcul automatique du montant
  const pricePerUnit = PRICES[type];
  if (!pricePerUnit) {
    // Au cas où le type ne correspondrait pas à un prix défini
    return res.status(400).json({
      message: "Type de transport non reconnu pour le calcul du prix.",
    });
  }
  const amount = quantity * pricePerUnit;

  try {
    const result = await pool.query(
      "INSERT INTO transports (type, quantity, amount) VALUES ($1, $2, $3) RETURNING id, timestamp;",
      [type, quantity, amount] // Insertion du montant CALCULÉ
    );
    res.status(201).json({
      message: "Transport enregistré avec succès",
      transport: result.rows[0],
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout du transport:", err);
    res.status(500).json({ error: err.message });
  }
});

// Route pour obtenir tous les transports
app.get("/api/transports", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT id, type, quantity, amount, timestamp
            FROM transports
            ORDER BY timestamp DESC;
        `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route pour obtenir le résumé du montant total et des quantités
app.get("/api/summary", async (req, res) => {
  try {
    const totalAmountResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric as total_amount
      FROM transports;
    `);

    const transportCountsResult = await pool.query(`
      SELECT type, COALESCE(SUM(quantity), 0)::int as total_quantity
      FROM transports
      GROUP BY type;
    `);

    // Formater les résultats pour les rendre faciles à utiliser
    const totalAmount = parseInt(totalAmountResult.rows[0].total_amount) || 0;
    const transportCounts = {
      sac: 0,
      bal: 0,
    };

    transportCountsResult.rows.forEach((row) => {
      transportCounts[row.type] = row.total_quantity;
    });

    res.json({
      total_amount: totalAmount,
      counts: transportCounts,
    });
  } catch (err) {
    console.error("Erreur lors du chargement du résumé:", err);
    res.status(500).json({ error: err.message });
  }
});
// Route pour supprimer un transport spécifique
app.delete("/api/transports/:id", async (req, res) => {
  const transportId = req.params.id;
  try {
    const result = await pool.query("DELETE FROM transports WHERE id = $1;", [
      transportId,
    ]);
    if (result.rowCount === 0) {
      res.status(404).json({ message: "Transport non trouvé." });
    } else {
      res.status(200).json({ message: "Transport supprimé avec succès." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
