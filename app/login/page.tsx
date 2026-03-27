"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { auth, db } from "../../src/lib/firebase";

type AppUser = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  active: boolean;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(safeTrim(email)) && Boolean(safeTrim(password)) && !loading;
  }, [email, password, loading]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setError("No matching DCFlow user profile found.");
        setLoading(false);
        return;
      }

      const appUser = snap.data() as AppUser;

      if (!appUser.active) {
        setError("Your account is inactive.");
        setLoading(false);
        return;
      }

      if (appUser.role === "technician") {
        router.push("/technician");
        return;
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
        backgroundColor: "background.default",
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 460,
          borderRadius: 3,
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          backgroundColor: "background.paper",
          boxShadow: "none",
        }}
      >
        <Stack spacing={3} sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Box
              sx={{
                position: "relative",
                width: { xs: 220, sm: 250 },
                height: { xs: 68, sm: 76 },
              }}
            >
              <Image
                src="/brand/dcflow-logo.png"
                alt="DCFlow"
                fill
                priority
                sizes="250px"
                style={{ objectFit: "contain" }}
              />
            </Box>

            <Stack spacing={0.75} alignItems="center">
              <Typography
                variant="h5"
                sx={{
                  lineHeight: 1.2,
                  textAlign: "center",
                }}
              >
                Sign in to DCFlow
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  maxWidth: 320,
                }}
              >
                Operations software for Daniel Cernoch Plumbing
              </Typography>
            </Stack>
          </Stack>

          <Box component="form" onSubmit={handleLogin}>
            <Stack spacing={2}>
              <TextField
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@company.com"
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-input": {
                    px: 1.75,
                    py: 1.6,
                  },
                }}
              />

              <TextField
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-input": {
                    px: 1.75,
                    py: 1.6,
                  },
                }}
              />

              {error ? (
                <Alert
                  severity="error"
                  variant="outlined"
                  sx={{
                    borderRadius: 1.5,
                  }}
                >
                  {error}
                </Alert>
              ) : null}

              <Button
                type="submit"
                disabled={!canSubmit}
                fullWidth
                variant="contained"
                sx={{
                  minHeight: 48,
                }}
              >
                {loading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} thickness={5} sx={{ color: "#061018" }} />
                    <span>Signing in...</span>
                  </Stack>
                ) : (
                  "Sign in"
                )}
              </Button>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  textAlign: "center",
                }}
              >
                Need access? Ask an admin to create your DCFlow user profile.
              </Typography>
            </Stack>
          </Box>

          <Divider />

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={0.75}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} Daniel Cernoch Plumbing
            </Typography>
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}