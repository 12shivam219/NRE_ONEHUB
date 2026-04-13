import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const groqApiKey = Deno.env.get("GROQ_API_KEY");

interface JobExtractionRequest {
  emailContent: string;
  emailSubject?: string;
  emailFrom?: string;
}

interface ExtractedJobDetails {
  jobTitle: string;
  hiringCompany: string;
  keySkills: string[];
  rate?: string;
  workLocationType?: string;
  duration?: string;
  vendor: string;
  vendorContact: string;
  vendorEmail: string;
  vendorPhone: string;
  jobDescription: string;
}

const JOB_EXTRACTION_PROMPT = `You are an expert recruiter. Extract job posting information from this text.

TEXT TO PARSE:
{content}

IMPORTANT: Extract ALL vendor/recruiter contact information (name, email, phone, company).
IMPORTANT: In the jobDescription field, remove ALL email addresses, phone numbers, person names, and URLs.

Extract ONLY the following information and return a JSON object:
{
  "jobTitle": "string - the position/job title (REQUIRED)",
  "hiringCompany": "string - the end client or hiring company name",
  "keySkills": ["array of required technical/professional skills"],
  "rate": "string - hourly/daily/yearly rate if mentioned (e.g., '$75/hour', '€85k/year', null if not mentioned)",
  "workLocationType": "string - Remote, On-site, Hybrid, Hybrid-Remote, etc. (null if not mentioned)",
  "duration": "string - contract duration if mentioned (e.g., '3 months', '6 months', 'Long-term', null if not mentioned)",
  "vendor": "string - the staffing/recruiting/vendor company name (REQUIRED - this is important)",
  "vendorContact": "string - the contact person's full name (REQUIRED - this is important)",
  "vendorEmail": "string - the contact person's email address (extract carefully)",
  "vendorPhone": "string - the contact person's phone number (extract carefully)",
  "jobDescription": "string - the complete job description with emails, phone numbers, person names, and contact URLs REMOVED. Keep the job content but strip all contact details."
}

Rules:
1. Always extract vendor/recruiter information - this is a staffing company
2. Remove ALL emails (xxx@xxx.com) from jobDescription
3. Remove ALL phone numbers from jobDescription
4. Remove names of recruiter/vendor people from jobDescription
5. Keep job details, requirements, location, and other useful information
6. Use null ONLY if information is truly not present in the text
7. Never use empty strings "" for required fields`;

async function callGroqAPI(messages: { role: string; content: string }[]) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

function removeContactDetails(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove email addresses
  cleaned = cleaned.replace(/[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email removed]');
  
  // Remove phone numbers (various formats)
  cleaned = cleaned.replace(/(\+1|1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, '[phone removed]');
  cleaned = cleaned.replace(/(\+\d{1,3})?[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[phone removed]');
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[link removed]');
  
  return cleaned;
}

function extractJSON(content: string) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }
  return JSON.parse(jsonMatch[0]);
}

async function extractJobDetails(
  content: string
): Promise<ExtractedJobDetails> {
  const prompt = JOB_EXTRACTION_PROMPT.replace("{content}", content.substring(0, 3000));

  const response = await callGroqAPI([
    {
      role: "system",
      content: "You are a job posting extraction AI. Extract ALL requested fields accurately. Vendor/recruiter contact information is critical. Respond ONLY with valid JSON.",
    },
    { role: "user", content: prompt },
  ]);

  console.log('Raw AI response:', response);

  const extracted = extractJSON(response) as ExtractedJobDetails;
  
  // Clean the job description of contact details
  let cleanedDescription = extracted.jobDescription || "";
  cleanedDescription = removeContactDetails(cleanedDescription);
  
  const result: ExtractedJobDetails = {
    jobTitle: extracted.jobTitle?.trim() || "",
    hiringCompany: extracted.hiringCompany?.trim() || "",
    keySkills: Array.isArray(extracted.keySkills) ? extracted.keySkills.filter(s => s) : [],
    rate: extracted.rate?.trim() || undefined,
    workLocationType: extracted.workLocationType?.trim() || undefined,
    duration: extracted.duration?.trim() || undefined,
    vendor: extracted.vendor?.trim() || "",
    vendorContact: extracted.vendorContact?.trim() || "",
    vendorEmail: extracted.vendorEmail?.trim() || "",
    vendorPhone: extracted.vendorPhone?.trim() || "",
    jobDescription: cleanedDescription,
  };

  console.log('Extracted and cleaned result:', result);
  
  return result;
}

serve(async (req: Request) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, prefer",
            },
        });
    }

    try {
        const { emailContent } = await req.json() as JobExtractionRequest;

        if (!emailContent) {
            return new Response(
                JSON.stringify({ error: "emailContent is required" }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                }
            );
        }

        // Extract job details
        const jobDetails = await extractJobDetails(emailContent);

        return new Response(
            JSON.stringify({
                success: true,
                data: jobDetails,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
});

serve(async (req: Request) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, prefer",
            },
        });
    }

    try {
        const { emailContent } = await req.json() as JobExtractionRequest;

        if (!emailContent) {
            return new Response(
                JSON.stringify({ error: "emailContent is required" }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                }
            );
        }

        // Extract job details
        const jobDetails = await extractJobDetails(emailContent);

        return new Response(
            JSON.stringify({
                success: true,
                data: jobDetails,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
});
