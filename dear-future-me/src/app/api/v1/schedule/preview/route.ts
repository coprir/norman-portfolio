import { api, body } from "@/server/api";
import { scheduleSchema } from "@/server/capsules/service";
import { badRequest } from "@/server/errors";
import { ScheduleError, computeUnlockAt, describeSchedule, formatInZone } from "@/lib/time/release";

/** The server, not the browser, decides the exact release instant. */
export const POST = api({}, async ({ req }) => {
  const input = await body(req, scheduleSchema);
  try {
    const unlockAt = computeUnlockAt(input);
    return { unlockAt: unlockAt.toISOString(), label: describeSchedule(input), display: formatInZone(unlockAt, input.timezone) };
  } catch (err) {
    if (err instanceof ScheduleError) throw badRequest(err.message);
    throw err;
  }
});
