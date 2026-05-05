"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ServiceTicketMapPreview from "./ServiceTicketMapPreview";
import {
  buildPreferredMapsHref,
  buildTelHref,
  detectAppleMapsPreference,
  formatServiceTicketAddress,
} from "../../src/lib/service-ticket-map";

type Props = {
  customerDisplayName?: string | null;
  customerHref?: string | null;
  serviceAddressLine1?: string | null;
  serviceAddressLine2?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  servicePostalCode?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  showEmail?: boolean;
};

export default function ServiceTicketLocationCard({
  customerDisplayName,
  customerHref,
  serviceAddressLine1,
  serviceAddressLine2,
  serviceCity,
  serviceState,
  servicePostalCode,
  customerPhone,
  customerEmail,
  showEmail = false,
}: Props) {
  const [preferAppleMaps, setPreferAppleMaps] = useState(false);

  useEffect(() => {
    setPreferAppleMaps(detectAppleMapsPreference());
  }, []);

  const mapsAddress = useMemo(
    () =>
      formatServiceTicketAddress({
        line1: serviceAddressLine1,
        line2: serviceAddressLine2,
        city: serviceCity,
        state: serviceState,
        postalCode: servicePostalCode,
      }),
    [
      serviceAddressLine1,
      serviceAddressLine2,
      serviceCity,
      serviceState,
      servicePostalCode,
    ]
  );

  const cleanCustomerName = String(customerDisplayName || "").trim();
  const cleanCustomerHref = String(customerHref || "").trim();

  const phoneHref = buildTelHref(customerPhone);
  const mapsHref = buildPreferredMapsHref(mapsAddress, preferAppleMaps);

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.2 }}>
      <CardHeader
        avatar={<PlaceOutlinedIcon color="primary" />}
        action={
          phoneHref ? (
            <Button
              component="a"
              href={phoneHref}
              variant="outlined"
              size="small"
              startIcon={<PhoneOutlinedIcon />}
              sx={{
                borderRadius: 999,
                fontWeight: 700,
                minWidth: 0,
                px: 1.25,
                whiteSpace: "nowrap",
              }}
            >
              {customerPhone}
            </Button>
          ) : null
        }
        title={
          cleanCustomerHref ? (
            <Button
              component={Link}
              href={cleanCustomerHref}
              variant="text"
              endIcon={<OpenInNewRoundedIcon fontSize="small" />}
              sx={{
                minWidth: 0,
                justifyContent: "flex-start",
                p: 0,
                color: "text.primary",
                textAlign: "left",
                textTransform: "none",
                fontSize: "1.25rem",
                fontWeight: 800,
                lineHeight: 1.25,
                maxWidth: "100%",
                "&:hover": {
                  backgroundColor: "transparent",
                  color: "primary.main",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                },
                "& .MuiButton-endIcon": {
                  ml: 0.75,
                },
              }}
            >
              <Typography
                component="span"
                variant="h6"
                fontWeight={800}
                noWrap
                sx={{ minWidth: 0, maxWidth: "100%" }}
              >
                {cleanCustomerName || "Customer"}
              </Typography>
            </Button>
          ) : (
            <Typography variant="h6" fontWeight={700} noWrap>
              {cleanCustomerName || "Customer"}
            </Typography>
          )
        }
      />

      <Divider />

      <CardContent>
        <Stack spacing={1.5}>
          {mapsAddress ? (
            <ServiceTicketMapPreview
              customerName={customerDisplayName}
              mapsAddress={mapsAddress}
              mapsHref={mapsHref}
              preferAppleMaps={preferAppleMaps}
            />
          ) : (
            <Alert severity="info" variant="outlined">
              No service address available for this ticket.
            </Alert>
          )}

          {showEmail && customerEmail ? (
            <Button
              component="a"
              href={`mailto:${customerEmail}`}
              variant="text"
              startIcon={<AlternateEmailRoundedIcon />}
              sx={{ alignSelf: "flex-start" }}
            >
              {customerEmail}
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}