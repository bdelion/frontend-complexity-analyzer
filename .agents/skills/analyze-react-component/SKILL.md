---
name: analyze-react-component
description: Examiner le périmètre et les métriques d'un composant React/TypeScript avant implémentation ou validation d'un analyseur.
---

# Analyse d'un composant React

1. Identifier le dossier du composant, ses exports publics et ses fichiers source.
2. Repérer les hooks/utilitaires partagés et éviter leur double attribution.
3. Associer tests Jest/Playwright et stories selon chemins et imports ; signaler les ambiguïtés.
4. Décrire les métriques mesurables (code, React, API, accessibilité) avec preuves fichier/ligne.
5. Distinguer métrique mesurée, estimation et donnée indisponible.
6. Ne jamais assimiler la présence d'ARIA à la conformité RGAA.
7. Présenter les limites et les cas nécessitant une vérification manuelle.

Ne modifier aucune librairie analysée.
