# ADR-001 — Séparer complexité, accessibilité et risque

**Statut : ACCEPTED — validé le 15 octobre 2026**

Validation utilisateur des arbitrages A01–A09 de la [V4](../design/specification-v4.md) : « Oui. Nous pourrons ensuite itérer suite à mes tests réels ».

## Contexte
Les spécifications proposent un score global combinant API, React, complexité, accessibilité, clavier et tests. Les pondérations divergent entre documents (20 % ou 15 % pour le clavier). Le nombre de tests ou d'attributs ARIA ne traduit pas directement la complexité intrinsèque.

## Décision
Publier séparément :
1. Complexité intrinsèque (code, architecture, React, surface API et comportements).
2. Obligations/effort d'accessibilité (patterns, focus, clavier, états accessibles ; **pas** conformité RGAA automatique).
3. Risque de maintenance (complexité, dépendances, couverture et historique si disponible).

Conserver toutes les métriques brutes. Ne pas fixer de poids définitifs ni de seuils sans calibration et revue humaine. Si un score de synthèse métier est demandé, en définir explicitement l'objectif et la formule.

## Conséquences validées

- Priorité à la comparaison technique et à l'orientation de maintenance (A03).
- Première restitution sous forme de profils de métriques brutes ; scores numériques et alertes 70/90 différés jusqu'à calibration (A01/A02).
- Mesure manquante explicitement indisponible ; aucun zéro de substitution ni redistribution silencieuse des poids (A06).
- Aucune conversion automatique en jours et aucune déduction de conformité RGAA.

## Questions restant ouvertes

- Quel corpus réel servira à calibrer les indicateurs et seuils éventuels ?
- Quels besoins supplémentaires ressortiront des tests réels de l'utilisateur ?

Les retours de terrain pourront faire évoluer les conventions de façon tracée ; l'acceptation de cette ADR ne valide aucune formule numérique future.
