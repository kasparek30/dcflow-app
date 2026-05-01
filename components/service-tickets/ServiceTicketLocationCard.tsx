"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import ServiceTicketMapPreview from "./ServiceTicketMapPreview";
import {
  buildPreferredMapsHref,
  buildTelHref,
  detectAppleMapsPreference,
  formatServiceTicketAddress,
} from "../../src/lib/service-ticket-map";

type Props = {
  customerDisplayName?: string | null;
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
          <Typography variant="h6" fontWeight={700} noWrap>
            {customerDisplayName || "Customer"}
          </Typography>
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