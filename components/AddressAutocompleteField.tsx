"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  ClickAwayListener,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";

declare global {
  interface Window {
    google?: any;
    __dcflowGoogleMapsPromise?: Promise<any>;
  }
}

export type GoogleAddressSelection = {
  placeId: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source: "google_places";
};

type SuggestionItem = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  placePrediction: any;
};

type AddressAutocompleteFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (selection: GoogleAddressSelection) => void;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  country?: string;
};

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available."));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google);
  }

  if (window.__dcflowGoogleMapsPromise) {
    return window.__dcflowGoogleMapsPromise;
  }

  window.__dcflowGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-dcflow-google-maps="true"]'
    );

    if (existing) {
      const handleLoad = () => {
        if (window.google?.maps?.importLibrary) {
          resolve(window.google);
        } else {
          reject(new Error("Google Maps script loaded, but importLibrary is unavailable."));
        }
      };

      const handleError = () => {
        reject(new Error("Google Maps script failed to load."));
      };

      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener("error", handleError, { once: true });
      return;
    }

    const callbackName = `__dcflowGoogleMapsInit_${Math.random().toString(36).slice(2)}`;

    const cleanup = () => {
      try {
        delete (window as any)[callbackName];
      } catch {
        (window as any)[callbackName] = undefined;
      }
    };

    (window as any)[callbackName] = () => {
      cleanup();

      if (window.google?.maps?.importLibrary) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps script loaded, but importLibrary is unavailable."));
      }
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&v=weekly&callback=${encodeURIComponent(callbackName)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-dcflow-google-maps", "true");

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Maps script failed to load."));
    };

    document.head.appendChild(script);
  });

  return window.__dcflowGoogleMapsPromise;
}

function parsePlaceAddress(
  place: any,
  fallbackDescription: string,
  fallbackPlaceId: string
): GoogleAddressSelection {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents : [];

  const getComponent = (type: string, useShortText = false) => {
    const match = components.find(
      (component: any) =>
        Array.isArray(component?.types) && component.types.includes(type)
    );

    if (!match) return "";

    const value = useShortText ? match.shortText : match.longText;
    return String(value || "").trim();
  };

  const streetNumber = getComponent("street_number");
  const route = getComponent("route");
  const premise = getComponent("premise");
  const subpremise = getComponent("subpremise");

  const formattedAddress = String(place?.formattedAddress || fallbackDescription || "").trim();

  const addressLine1 =
    [streetNumber, route].filter(Boolean).join(" ") ||
    premise ||
    formattedAddress.split(",")[0]?.trim() ||
    "";

  const city =
    getComponent("locality") ||
    getComponent("postal_town") ||
    getComponent("sublocality_level_1") ||
    getComponent("administrative_area_level_2");

  const state = getComponent("administrative_area_level_1", true);
  const postalCodeBase = getComponent("postal_code");
  const postalCodeSuffix = getComponent("postal_code_suffix");
  const postalCode =
    [postalCodeBase, postalCodeSuffix].filter(Boolean).join("-") || postalCodeBase || "";

  return {
    placeId: String(place?.id || fallbackPlaceId || "").trim(),
    formattedAddress,
    addressLine1,
    addressLine2: subpremise || undefined,
    city,
    state,
    postalCode,
    source: "google_places",
  };
}

export default function AddressAutocompleteField({
  label = "Search address",
  value,
  onChange,
  onSelectAddress,
  helperText,
  placeholder = "Start typing a street address...",
  disabled = false,
  required = false,
  country = "us",
}: AddressAutocompleteFieldProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);

  const autocompleteSuggestionRef = useRef<any>(null);
  const sessionTokenCtorRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!apiKey) {
        setLoadError(
          "Google Maps API key is missing. You can still enter the address manually."
        );
        return;
      }

      try {
        const googleMaps = await loadGoogleMaps(apiKey);
        const placesLib = await googleMaps.maps.importLibrary("places");

        if (cancelled) return;

        autocompleteSuggestionRef.current = placesLib.AutocompleteSuggestion;
        sessionTokenCtorRef.current = placesLib.AutocompleteSessionToken;
        sessionTokenRef.current =
          sessionTokenRef.current || new placesLib.AutocompleteSessionToken();

        setReady(true);
        setLoadError("");
      } catch (error: unknown) {
        if (cancelled) return;

        setLoadError(
          error instanceof Error
            ? error.message
            : "Google Maps failed to load. You can still enter the address manually."
        );
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || disabled) return;

    const query = String(value || "").trim();

    if (query.length < 3) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const currentRequest = ++requestSequenceRef.current;
    setLoadingSuggestions(true);

    const timer = window.setTimeout(async () => {
      try {
        const AutocompleteSuggestion = autocompleteSuggestionRef.current;
        const SessionToken = sessionTokenCtorRef.current;

        if (!AutocompleteSuggestion || !SessionToken) {
          setLoadingSuggestions(false);
          return;
        }

        sessionTokenRef.current = sessionTokenRef.current || new SessionToken();

        const request: any = {
          input: query,
          includedRegionCodes: country ? [country.toLowerCase()] : undefined,
          sessionToken: sessionTokenRef.current,
        };

        const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        if (currentRequest !== requestSequenceRef.current) return;

        const nextSuggestions: SuggestionItem[] = Array.isArray(result?.suggestions)
          ? result.suggestions
              .map((suggestion: any) => {
                const prediction = suggestion?.placePrediction;
                const placeId = String(prediction?.placeId || "").trim();
                const description = String(
                  prediction?.text?.text || prediction?.mainText?.text || ""
                ).trim();
                const mainText = String(
                  prediction?.mainText?.text || prediction?.text?.text || ""
                ).trim();
                const secondaryText = String(
                  prediction?.secondaryText?.text || ""
                ).trim();

                return {
                  placeId,
                  description,
                  mainText,
                  secondaryText,
                  placePrediction: prediction,
                };
              })
              .filter((item: SuggestionItem) => Boolean(item.placeId && item.description))
          : [];

        setSuggestions(nextSuggestions);
        setLoadingSuggestions(false);
      } catch (error: unknown) {
        if (currentRequest !== requestSequenceRef.current) return;

        setSuggestions([]);
        setLoadingSuggestions(false);

        if (error instanceof Error) {
          setLoadError(error.message);
        } else {
          setLoadError("Address suggestions failed to load. You can still enter it manually.");
        }
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [country, disabled, ready, value]);

  const resolvedHelperText = useMemo(() => {
    if (loadError) return loadError;
    if (helperText) return helperText;
    return "Start typing to search for a real address, or keep entering it manually.";
  }, [helperText, loadError]);

  async function handleSuggestionClick(item: SuggestionItem) {
    if (!item.placePrediction?.toPlace) return;

    setSelectionLoading(true);
    setLoadError("");

    try {
      const place = item.placePrediction.toPlace();

      await place.fetchFields({
        fields: ["formattedAddress", "addressComponents"],
      });

      const parsed = parsePlaceAddress(place, item.description, item.placeId);

      onChange(parsed.formattedAddress || item.description);
      onSelectAddress(parsed);
      setOpen(false);
      setSuggestions([]);

      const SessionToken = sessionTokenCtorRef.current;
      if (SessionToken) {
        sessionTokenRef.current = new SessionToken();
      }
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Google returned an incomplete address. Please enter it manually."
      );
    } finally {
      setSelectionLoading(false);
    }
  }

  const showDropdown =
    open &&
    !disabled &&
    suggestions.length > 0 &&
    String(value || "").trim().length >= 3;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: "relative" }}>
        <TextField
          label={label}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          helperText={resolvedHelperText}
          required={required}
          disabled={disabled}
          fullWidth
          InputProps={{
            startAdornment: (
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  mr: 1,
                  color: "text.secondary",
                }}
              >
                <SearchRoundedIcon fontSize="small" />
              </Box>
            ),
            endAdornment:
              loadingSuggestions || selectionLoading ? (
                <CircularProgress size={18} />
              ) : undefined,
          }}
        />

        {showDropdown ? (
          <Paper
            elevation={8}
            sx={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 20,
              overflow: "hidden",
              borderRadius: 3,
            }}
          >
            <List disablePadding>
              {suggestions.map((item, index) => (
                <ListItemButton
                  key={`${item.placeId}-${index}`}
                  onClick={() => handleSuggestionClick(item)}
                  divider={index < suggestions.length - 1}
                  sx={{ alignItems: "flex-start", py: 1.25 }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box sx={{ color: "text.secondary", pt: 0.2 }}>
                      <LocationOnRoundedIcon fontSize="small" />
                    </Box>

                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.mainText || item.description}
                        </Typography>
                      }
                      secondary={
                        item.secondaryText ? (
                          <Typography variant="caption" color="text.secondary">
                            {item.secondaryText}
                          </Typography>
                        ) : null
                      }
                    />
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          </Paper>
        ) : null}
      </Box>
    </ClickAwayListener>
  );
}