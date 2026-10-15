import { useState } from 'react';

interface Props {
  label: string;
  onPress?: () => void;
}

/** Bouton de démonstration synthétique, jamais exécuté par l'analyseur. */
export function Button(props: Props) {
  const [active] = useState(false);
  return (
    <button aria-label="Démonstration" onClick={props.onPress}>
      {active ? 'Actif' : props.label}
    </button>
  );
}
