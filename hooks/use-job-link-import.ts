"use client";

import { useCallback, useRef, useState } from "react";
import { requestJobDescription, resolveJobLinkSource, sourceLabel } from "@/lib/job-link";
import { hasServerFeatures, jobLinkUrl, withBasePath } from "@/lib/runtime-capabilities";

export type JobLinkState = { busy: boolean; message: string; failed: boolean };

/**
 * Paste a link to a role, get the description text back.
 *
 * The fetch happens server-side — a browser cannot read a job board on another
 * origin — so this is only wired up when the build has somewhere to send it.
 * Imported text lands in the same editable textarea as pasted text, because an
 * extraction is a starting point and the person applying knows the role better
 * than the parser does.
 */
export function useJobLinkImport(getAccessToken: () => Promise<string | null>) {
  const source = resolveJobLinkSource({ hasServerFeatures, routeUrl: withBasePath("/api/job-link"), edgeFunctionUrl: jobLinkUrl });
  const [state, setState] = useState<JobLinkState>({ busy: false, message: "", failed: false });
  // A second submit while one is in flight would race two writes into the field.
  const inFlight = useRef(false);

  const importUrl = useCallback(
    async (url: string, onImported: (jobDescription: string) => void) => {
      if (!source || inFlight.current) return;
      inFlight.current = true;
      setState({ busy: true, message: "Reading the posting…", failed: false });
      try {
        const accessToken = source.requiresAuth ? await getAccessToken() : null;
        const result = await requestJobDescription({ source, url, accessToken });
        if (!result.ok) {
          setState({ busy: false, message: result.message, failed: true });
          return;
        }
        onImported(result.jobDescription);
        setState({
          busy: false,
          failed: false,
          message: result.distilled
            ? `Imported from ${sourceLabel(result.sourceUrl)}. Review or edit it below.`
            : `Imported the text from ${sourceLabel(result.sourceUrl)} as-is. Trim anything that is not the role.`,
        });
      } finally {
        inFlight.current = false;
      }
    },
    [getAccessToken, source],
  );

  return { available: Boolean(source), state, importUrl };
}
