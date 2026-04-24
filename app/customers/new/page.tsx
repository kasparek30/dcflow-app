"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddHomeRoundedIcon from "@mui/icons-material/AddHomeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EditLocationAltRoundedIcon from "@mui/icons-material/EditLocationAltRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AppShell from "../../../components/AppShell";
import AddressAutocompleteField, {
  type GoogleAddressSelection,
} from "../../../components/AddressAutocompleteField";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

function createAddressId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `addr_${Math.random().toString(36).slice(2, 11)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export default function NewCustomerPage() {
  const router = useRouter();
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [displayName, setDisplayName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [addressSearch, setAddressSearch] = useState("");
  const [billingAddressLine1, setBillingAddressLine1] = useState("");
  const [billingAddressLine2, setBillingAddressLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingAddressSource, setBillingAddressSource] = useState<
    "manual" | "google_places"
  >("manual");

  const [useBillingAsPrimaryService, setUseBillingAsPrimaryService] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addressStatusLabel = useMemo(() => {
    return billingAddressSource === "google_places" ? "Validated" : "Manual";
  }, [billingAddressSource]);

  function markBillingManual() {
    setBillingAddressSource((current) =>
      current === "google_places" ? "manual" : current
    );
  }

  function handleGoogleAddressSelected(selection: GoogleAddressSelection) {
    setAddressSearch(selection.formattedAddress);
    setBillingAddressLine1(selection.addressLine1 || "");
    setBillingAddressLine2(selection.addressLine2 || "");
    setBillingCity(selection.city || "");
    setBillingState(selection.state || "");
    setBillingPostalCode(selection.postalCode || "");
    setBillingAddressSource("google_places");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const nestedAddressTimestamp = nowIso();

      const serviceAddresses = useBillingAsPrimaryService
        ? [
            {
              id: createAddressId(),
              label: "Primary Service Location",
              addressLine1: billingAddressLine1.trim(),
              addressLine2: billingAddressLine2.trim() || null,
              city: billingCity.trim(),
              state: billingState.trim(),
              postalCode: billingPostalCode.trim(),
              notes: null,
              active: true,
              isPrimary: true,
              source: billingAddressSource,
              createdAt: nestedAddressTimestamp,
              updatedAt: nestedAddressTimestamp,
            },
          ]
        : [];

      const docRef = await addDoc(collection(db, "customers"), {
        source: "dcflow",
        quickbooksCustomerId: null,

        displayName: displayName.trim(),
        phonePrimary: phonePrimary.trim(),
        phoneSecondary: phoneSecondary.trim() || null,
        email: email.trim() || null,

        billingAddressLine1: billingAddressLine1.trim(),
        billingAddressLine2: billingAddressLine2.trim() || null,
        billingCity: billingCity.trim(),
        billingState: billingState.trim(),
        billingPostalCode: billingPostalCode.trim(),
        billingAddressSource,

        serviceAddresses,

        notes: notes.trim() || null,
        active: true,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push(`/customers/${docRef.id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create customer.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Customer">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1100, mx: "auto", px: { xs: 1, sm: 2 }, pb: 4 }}>
          <Stack spacing={3}>
            <Box sx={{ pt: 0.75 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip
                      size="small"
                      icon={<PersonAddAltRoundedIcon sx={{ fontSize: 16 }} />}
                      label="Customers"
                      sx={{
                        borderRadius: 1.5,
                        fontWeight: 700,
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                      }}
                    />
                  </Stack>

                  <Typography
                    variant="h4"
                    sx={{
                      fontSize: { xs: "1.8rem", md: "2.15rem" },
                      lineHeight: 1.05,
                      fontWeight: 800,
                      letterSpacing: "-0.035em",
                    }}
                  >
                    New Customer
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.85,
                      color: "text.secondary",
                      fontSize: { xs: 13, md: 14 },
                      fontWeight: 500,
                      maxWidth: 860,
                    }}
                  >
                    Create a customer, capture clean address data, and optionally save the billing
                    address as the primary service location right away.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/customers"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  Back to Customers
                </Button>
              </Stack>
            </Box>

            <Card
              elevation={0}
              sx={{
                borderRadius: 5,
                border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                overflow: "hidden",
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack spacing={3}>
                    <Stack spacing={1}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Customer contact
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Start with the main contact info DCFlow will use across tickets, dispatch,
                        and billing.
                      </Typography>
                    </Stack>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        label="Display Name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        fullWidth
                      />

                      <TextField
                        label="Primary Phone"
                        value={phonePrimary}
                        onChange={(e) => setPhonePrimary(e.target.value)}
                        required
                        fullWidth
                      />

                      <TextField
                        label="Secondary Phone"
                        value={phoneSecondary}
                        onChange={(e) => setPhoneSecondary(e.target.value)}
                        fullWidth
                      />

                      <TextField
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        fullWidth
                      />
                    </Box>

                    <Divider />

                    <Stack spacing={1}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                      >
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>
                            Billing address
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Use the smart lookup first to reduce typos, then adjust anything
                            manually if needed.
                          </Typography>
                        </Box>

                        <Chip
                          icon={
                            billingAddressSource === "google_places" ? (
                              <CheckCircleRoundedIcon />
                            ) : (
                              <EditLocationAltRoundedIcon />
                            )
                          }
                          label={addressStatusLabel}
                          color={
                            billingAddressSource === "google_places" ? "success" : "default"
                          }
                          variant={
                            billingAddressSource === "google_places" ? "filled" : "outlined"
                          }
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        />
                      </Stack>
                    </Stack>

                    <AddressAutocompleteField
                      label="Search address"
                      value={addressSearch}
                      onChange={setAddressSearch}
                      onSelectAddress={handleGoogleAddressSelected}
                      helperText="Search for the address first, then DCFlow will fill the fields below."
                    />

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        label="Billing Address Line 1"
                        value={billingAddressLine1}
                        onChange={(e) => {
                          markBillingManual();
                          setBillingAddressLine1(e.target.value);
                        }}
                        required
                        fullWidth
                      />

                      <TextField
                        label="Billing Address Line 2"
                        value={billingAddressLine2}
                        onChange={(e) => {
                          markBillingManual();
                          setBillingAddressLine2(e.target.value);
                        }}
                        fullWidth
                      />
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        label="City"
                        value={billingCity}
                        onChange={(e) => {
                          markBillingManual();
                          setBillingCity(e.target.value);
                        }}
                        required
                        fullWidth
                      />

                      <TextField
                        label="State"
                        value={billingState}
                        onChange={(e) => {
                          markBillingManual();
                          setBillingState(e.target.value);
                        }}
                        required
                        fullWidth
                      />

                      <TextField
                        label="Postal Code"
                        value={billingPostalCode}
                        onChange={(e) => {
                          markBillingManual();
                          setBillingPostalCode(e.target.value);
                        }}
                        required
                        fullWidth
                      />
                    </Box>

                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <PlaceRoundedIcon color="primary" />
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                              Service location shortcut
                            </Typography>
                          </Stack>

                          <Typography variant="body2" color="text.secondary">
                            This gives you a pilot-safe way to create a clean customer record and
                            a usable primary service address in one pass.
                          </Typography>

                          <FormControlLabel
                            control={
                              <Switch
                                checked={useBillingAsPrimaryService}
                                onChange={(e) =>
                                  setUseBillingAsPrimaryService(e.target.checked)
                                }
                              />
                            }
                            label="Use billing address as primary service location"
                            sx={{ m: 0 }}
                          />

                          {useBillingAsPrimaryService ? (
                            <Chip
                              icon={<AddHomeRoundedIcon />}
                              label="A primary service location will be created from this address."
                              color="primary"
                              variant="outlined"
                              sx={{ width: "fit-content", borderRadius: 99, fontWeight: 700 }}
                            />
                          ) : null}
                        </Stack>
                      </CardContent>
                    </Card>

                    <Divider />

                    <Stack spacing={1}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Internal notes
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Optional context for office use.
                      </Typography>
                    </Stack>

                    <TextField
                      label="Notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      multiline
                      minRows={4}
                      fullWidth
                    />

                    {error ? (
                      <Alert severity="error" sx={{ borderRadius: 4 }}>
                        {error}
                      </Alert>
                    ) : null}

                    <Stack
                      direction={{ xs: "column-reverse", sm: "row" }}
                      spacing={1.5}
                      justifyContent="space-between"
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Smart lookup is optional. Office staff can still save a customer manually
                        if needed.
                      </Typography>

                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={<SaveRoundedIcon />}
                        disabled={saving}
                        sx={{
                          borderRadius: 2,
                          fontWeight: 700,
                          minHeight: 42,
                          boxShadow: "none",
                        }}
                      >
                        {saving ? "Saving..." : "Create Customer"}
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
