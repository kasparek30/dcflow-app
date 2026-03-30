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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
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

const wave = keyframes`
  0% { transform: translateX(-80%); opacity: 0.35; }
  50% { opacity: 1; }
  100% { transform: translateX(120%); opacity: 0.35; }
`;

const pulse = keyframes`
  0% { transform: scale(0.96); opacity: 0.7; }
  50% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(0.96); opacity: 0.7; }
`;

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

      if (appUser.role === "technician" || appUser.role === "helper") {
        router.push("/technician/my-day");
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
        position: "relative",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        px: { xs: 2, sm: 3 },
        py: "calc(env(safe-area-inset-top) + 24px)",
        backgroundColor: "#070A0F",
      }}
    >
      {/* Main blue glow */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 520px at 50% 22%, rgba(0,140,255,0.30) 0%, rgba(0,140,255,0.06) 45%, rgba(0,0,0,0) 70%)",
        }}
      />

      {/* Secondary glow */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          right: "-260px",
          bottom: "-260px",
          width: 560,
          height: 560,
          borderRadius: "999px",
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 30% 30%, rgba(72,190,255,0.22), rgba(0,0,0,0) 62%)",
          filter: "blur(6px)",
        }}
      />

      {/* Grid overlay */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(closest-side at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0))",
          WebkitMaskImage:
            "radial-gradient(closest-side at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0))",
        }}
      />

      <Card
        elevation={0}
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 540,
          borderRadius: 5,
          overflow: "hidden",
          border: `1px solid ${alpha("#FFFFFF", 0.1)}`,
          background: `
            linear-gradient(180deg, ${alpha("#FFFFFF", 0.08)} 0%, ${alpha("#FFFFFF", 0.04)} 100%)
          `,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Accent bar */}
        <Box
          sx={{
            height: 4,
            background:
              "linear-gradient(90deg, #0D7EF2 0%, #47B8FF 52%, #FF2A36 100%)",
          }}
        />

        <Stack spacing={3} sx={{ p: { xs: 2.25, sm: 3 } }}>
          {/* Logo */}
          <Box
            sx={{
              pt: 1,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Box
              sx={{
                position: "relative",
                width: "min(300px, 76vw)",
                aspectRatio: "300 / 97",
                filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.35))",
              }}
            >
              <Image
                src="/brand/dcflow-logo.png"
                alt="DCFlow"
                fill
                priority
                sizes="(max-width: 600px) 76vw, 300px"
                style={{ objectFit: "contain" }}
              />
            </Box>
          </Box>

          {/* Header */}
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography
              variant="h4"
              sx={{
                color: "#FFFFFF",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                fontSize: { xs: "1.55rem", sm: "1.9rem" },
                lineHeight: 1.1,
              }}
            >
              Sign in to DCFlow
            </Typography>
          </Stack>

          {/* Form */}
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
                fullWidth
                variant="outlined"
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    color: "#FFFFFF",
                    backgroundColor: alpha("#000000", 0.24),
                    transition: "all 180ms ease",
                    "& fieldset": {
                      borderColor: alpha("#FFFFFF", 0.14),
                    },
                    "&:hover fieldset": {
                      borderColor: alpha("#47B8FF", 0.45),
                    },
                    "&.Mui-focused": {
                      backgroundColor: alpha("#0A1220", 0.72),
                      boxShadow: `0 0 0 4px ${alpha("#0D7EF2", 0.14)}`,
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#47B8FF",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: alpha("#FFFFFF", 0.74),
                    fontWeight: 700,
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: alpha("#FFFFFF", 0.42),
                    opacity: 1,
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
                fullWidth
                variant="outlined"
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    color: "#FFFFFF",
                    backgroundColor: alpha("#000000", 0.24),
                    transition: "all 180ms ease",
                    "& fieldset": {
                      borderColor: alpha("#FFFFFF", 0.14),
                    },
                    "&:hover fieldset": {
                      borderColor: alpha("#47B8FF", 0.45),
                    },
                    "&.Mui-focused": {
                      backgroundColor: alpha("#0A1220", 0.72),
                      boxShadow: `0 0 0 4px ${alpha("#0D7EF2", 0.14)}`,
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#47B8FF",
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: alpha("#FFFFFF", 0.74),
                    fontWeight: 700,
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: alpha("#FFFFFF", 0.42),
                    opacity: 1,
                  },
                }}
              />

              {error ? (
                <Alert
                  severity="error"
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    color: "#FFFFFF",
                    backgroundColor: alpha("#FF2A36", 0.08),
                    borderColor: alpha("#FF2A36", 0.28),
                    "& .MuiAlert-icon": {
                      color: "#FF6B73",
                    },
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
                startIcon={
                  loading ? (
                    <CircularProgress size={18} thickness={5} sx={{ color: "#061018" }} />
                  ) : (
                    <LockRoundedIcon />
                  )
                }
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  minHeight: 54,
                  borderRadius: 3,
                  textTransform: "none",
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                  color: "#061018",
                  border: `1px solid ${alpha("#0D7EF2", 0.5)}`,
                  background:
                    "linear-gradient(90deg, #0D7EF2 0%, #47B8FF 55%, #0D7EF2 100%)",
                  boxShadow: "0 18px 34px rgba(13,126,242,0.22)",
                  "&:hover": {
                    background:
                      "linear-gradient(90deg, #0B74DD 0%, #62C3FF 55%, #0B74DD 100%)",
                    boxShadow: "0 20px 38px rgba(13,126,242,0.28)",
                  },
                  "&.Mui-disabled": {
                    color: alpha("#FFFFFF", 0.55),
                    background: alpha("#FFFFFF", 0.1),
                    borderColor: alpha("#FFFFFF", 0.1),
                    boxShadow: "none",
                  },
                  "&::after": loading
                    ? {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.24) 45%, rgba(255,255,255,0) 80%)",
                        transform: "translateX(-90%)",
                        animation: `${wave} 900ms ease-in-out infinite`,
                      }
                    : {},
                }}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <Typography
                sx={{
                  textAlign: "center",
                  color: alpha("#FFFFFF", 0.6),
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                Need access? Ask an admin to create your DCFlow user profile.
              </Typography>
            </Stack>
          </Box>

          {/* Footer */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            sx={{
              pt: 2,
              borderTop: `1px solid ${alpha("#FFFFFF", 0.1)}`,
            }}
          >
            <Typography
              sx={{
                color: alpha("#FFFFFF", 0.6),
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              © {new Date().getFullYear()} Daniel Cernoch Plumbing
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  borderRadius: "999px",
                  backgroundColor: alpha("#FF2A36", 0.14),
                  animation: `${pulse} 1300ms ease-in-out infinite`,
                }}
              >
                <WaterDropRoundedIcon
                  sx={{
                    fontSize: 14,
                    color: "#FF2A36",
                  }}
                />
              </Box>

              <Typography
                sx={{
                  color: alpha("#FFFFFF", 0.66),
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Modern Utility
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}