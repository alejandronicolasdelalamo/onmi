import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Estado de un diálogo que también puede abrirse con `?new=1` en la URL
 * (lo usan la paleta de comandos y los accesos directos). El estado se deriva de la URL,
 * sin efectos que sincronicen estados.
 */
export function useNewDialog(): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const [manual, setManual] = useState(false);
  const fromUrl = params.get("new") === "1";

  const setOpen = useCallback(
    (open: boolean) => {
      setManual(open);
      if (!open && fromUrl) setParams({}, { replace: true });
    },
    [fromUrl, setParams],
  );

  return [manual || fromUrl, setOpen];
}
