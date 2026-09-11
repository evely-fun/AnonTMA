import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { backButton } from "@/shared/lib/telegram";

export const useBackButton = (fallback = "/"): void => {
  const navigate = useNavigate();

  useEffect(() => {
    const detach = backButton.show(() => {
      navigate(fallback);
    });
    return detach;
  }, [navigate, fallback]);
};
