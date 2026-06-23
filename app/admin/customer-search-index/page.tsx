// app/admin/customer-search-index/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { buildCustomerIndexPayload } from "../../../src/lib/customer-search-index";

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1250;

function safeStr(value: unknown) {
  return String(value ?? "").trim();
}

function getCustomerName(data: any, fallbackId: string) {
  return (
    safeStr(data.displayName) ||
    safeStr(data.customerDisplayName) ||
    safeStr(data.qboDisplayName) ||
    fallbackId
  );
}

export default function CustomerSearchIndexBackfillPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const canRun = appUser?.role === "admin";

  const [running, setRunning] = useState(false);
  const stopRequestedRef = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [batchNumber, setBatchNumber] = useState(0);
  const [lastCustomerName, setLastCustomerName] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const progressLabel = useMemo(() => {
    if (done) return "Backfill complete";
    if (running) return `Processing batch ${batchNumber || 1}...`;
    if (processed > 0) return "Backfill paused";
    return "Ready to backfill";
  }, [batchNumber, done, processed, running]);

  async function runBackfill() {
    if (!canRun || running) return;

    setRunning(true);
    stopRequestedRef.current = false;
    setStopRequested(false);
    setDone(false);
    setError("");
    setProcessed(0);
    setUpdated(0);
    setBatchNumber(0);
    setLastCustomerName("");

    let lastDoc: QueryDocumentSnapshot<DocumentData, DocumentData> | null = null;
    let localProcessed = 0;
    let localUpdated = 0;
    let localBatch = 0;
    let shouldStop = false;

    try {
      while (!shouldStop) {
        localBatch += 1;
        setBatchNumber(localBatch);

        const customersRef = collection(db, "customers");
        const q = lastDoc
          ? query(
              customersRef,
              orderBy(documentId()),
              startAfter(lastDoc),
              limit(BATCH_SIZE),
            )
          : query(customersRef, orderBy(documentId()), limit(BATCH_SIZE));

        const snap = await getDocs(q);

        if (snap.empty) {
          setDone(true);
          break;
        }

        const batch = writeBatch(db);

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const payload = buildCustomerIndexPayload(data);

          batch.update(docSnap.ref, payload);
          localProcessed += 1;
          localUpdated += 1;

          setLastCustomerName(getCustomerName(data, docSnap.id));
        });

        await batch.commit();

        lastDoc = snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot<
          DocumentData,
          DocumentData
        >;

        setProcessed(localProcessed);
        setUpdated(localUpdated);

        if (snap.size < BATCH_SIZE) {
          setDone(true);
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, BATCH_DELAY_MS));

        shouldStop = stopRequestedRef.current;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Customer index backfill failed. Stop and rerun after a minute if Firestore says the write stream is exhausted.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Customer Search Index">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: "primary.main",
                  }}
                >
                  <ManageSearchRoundedIcon />
                </Box>

                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
                    Customer Search Index
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Backfill customer search and filter fields without loading the full customer list in the browser.
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {!canRun ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Only admin users can run this backfill.
              </Alert>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {error}
              </Alert>
            ) : null}

            {done ? (
              <Alert severity="success" sx={{ borderRadius: 3 }} icon={<TaskAltRoundedIcon />}>
                Backfill complete. Customer filters like Needs Service Address, Billing-Only, QBO Linked, and Multi-Property should now return accurate results.
              </Alert>
            ) : null}

            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2.5}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {progressLabel}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Processes customers in small throttled batches of {BATCH_SIZE} to avoid overloading the Firestore web write stream. You can leave this page open until complete.
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                      {running ? (
                        <Button
                          variant="outlined"
                          color="warning"
                          startIcon={<StopRoundedIcon />}
                          onClick={() => {
                            stopRequestedRef.current = true;
                            setStopRequested(true);
                          }}
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        >
                          {stopRequested ? "Stopping..." : "Stop After Batch"}
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          startIcon={<PlayArrowRoundedIcon />}
                          onClick={runBackfill}
                          disabled={!canRun}
                          sx={{ borderRadius: 99, fontWeight: 800 }}
                        >
                          Run Backfill
                        </Button>
                      )}
                    </Stack>
                  </Stack>

                  {running ? <LinearProgress sx={{ borderRadius: 99 }} /> : null}

                  <Divider />

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                      gap: 1.5,
                    }}
                  >
                    <Chip label={`Processed: ${processed}`} sx={{ justifyContent: "flex-start", borderRadius: 2, fontWeight: 700, p: 2 }} />
                    <Chip label={`Updated: ${updated}`} sx={{ justifyContent: "flex-start", borderRadius: 2, fontWeight: 700, p: 2 }} />
                    <Chip label={`Batch: ${batchNumber}`} sx={{ justifyContent: "flex-start", borderRadius: 2, fontWeight: 700, p: 2 }} />
                  </Box>

                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Last customer processed
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 800, mt: 0.5 }}>
                      {lastCustomerName || "—"}
                    </Typography>
                  </Box>

                  {running ? (
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <CircularProgress size={18} />
                      <Typography variant="body2" color="text.secondary">
                        Writing customer index fields to Firestore...
                      </Typography>
                    </Stack>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>

            <Alert severity="info" sx={{ borderRadius: 3 }}>
              This does not create service tickets or change billing addresses. It only adds lightweight searchable/indexed fields to customer docs so the Customers page can search and filter safely.
            </Alert>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
