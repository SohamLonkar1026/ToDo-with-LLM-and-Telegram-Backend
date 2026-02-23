import * as chrono from "chrono-node";
import { fromZonedTime } from "date-fns-tz";

export function parseTelegramDate(text: string): { date: Date, remainingText: string } | null {
    const results = chrono.parse(text);
    if (!results.length) return null;

    const result = results[0];
    const parsedLocal = result.start.date();
    const matchText = result.text;

    // Force interpretation as Asia/Kolkata time
    // fromZonedTime(date, zone) -> UTC Date
    // "17:00 Face Value" + "Asia/Kolkata" -> "11:30 UTC"
    const utcDate = fromZonedTime(parsedLocal, "Asia/Kolkata");

    console.log("🚨 TELEGRAM PARSER ACTIVE");
    console.log("Parsed Local:", parsedLocal);
    console.log("Converted UTC:", utcDate.toISOString());
    console.log("Match Text:", matchText);

    // Remove the matched text from the original text to get the remaining text
    // We replace only the first occurrence to be safe
    const remainingText = text.replace(matchText, "").trim();

    return {
        date: utcDate,
        remainingText: remainingText
    };
}
