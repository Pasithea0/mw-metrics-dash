import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL."),
});

const errorTitles = [
  "Oops! We hit a snag:",
  "Houston, we have a problem:",
  "Well, this is awkward:",
  "Unexpected detour:",
  "That didn't go as planned:",
  "Minor setback detected:",
  "Plot twist:",
  "Hmm, something's not right:",
  "We ran into a hiccup:",
  "Quick heads up:",
];

const urlSuggestions = {
  protocols: ["https://", "http://"],
  subdomains: ["server.", "api.", "staging.", "www."],
  tlds: [".com", ".net", ".org", ".io", ".co", ".dev"],
  paths: ["/metrics"],
};

interface MetricsFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  autoRefresh: boolean;
  onAutoRefreshToggle: () => void;
  currentUrl?: string;
}

export function MetricsForm({
  onSubmit,
  isLoading,
  autoRefresh,
  onAutoRefreshToggle,
  currentUrl,
}: MetricsFormProps) {
  const { toast } = useToast();
  const [localLoading, setLocalLoading] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: currentUrl || "",
    },
  });

  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    if (autoRefresh && form.getValues().url) {
      const url = form.getValues().url;
      if (formSchema.shape.url.safeParse(url).success) {
        refreshIntervalRef.current = setInterval(() => {
          if (!isLoading && !localLoading) {
            handleSubmit(form.getValues());
          }
        }, 10000);
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, isLoading, localLoading, form.getValues().url]);

  const updateSuggestions = (input: string) => {
    let newSuggestions: string[] = [];

    if (!input) {
      newSuggestions = urlSuggestions.protocols;
    } else if (!input.startsWith("http")) {
      newSuggestions = urlSuggestions.protocols.filter((p) =>
        p.startsWith(input)
      );
    } else {
      const protocol = input.startsWith("https://") ? "https://" : "http://";
      const rest = input.slice(protocol.length);

      if (rest.includes("/")) {
        const pathPart = rest.split("/").pop() || "";
        newSuggestions = urlSuggestions.paths
          .filter((p) => p.startsWith(`/${pathPart}`))
          .map((p) => p.slice(pathPart.length));
      } else {
        const domainParts = rest.split(".");
        const lastPart = domainParts[domainParts.length - 1];

        if (input.endsWith(".")) {
          newSuggestions = urlSuggestions.tlds;
        } else if (domainParts.length === 1) {
          const subMatches = urlSuggestions.subdomains.filter((s) =>
            s.startsWith(rest)
          );
          newSuggestions =
            subMatches.length > 0 ? subMatches : urlSuggestions.tlds;
        } else {
          newSuggestions = urlSuggestions.tlds
            .filter((tld) => tld.startsWith(`.${lastPart}`))
            .map((tld) => tld.slice(lastPart.length));
        }
      }
    }

    setSuggestions(newSuggestions.slice(0, 5));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setValue("url", value);
    updateSuggestions(value);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && suggestions.length > 0 && showSuggestions) {
      e.preventDefault();
      const currentValue = form.getValues().url;
      form.setValue("url", currentValue + suggestions[0]);
      setShowSuggestions(false);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const currentValue = form.getValues().url;
    form.setValue("url", currentValue + suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getRandomErrorTitle = () => {
    const randomIndex = Math.floor(Math.random() * errorTitles.length);
    return errorTitles[randomIndex];
  };

  const checkUrlAvailability = async (url: string): Promise<boolean> => {
    const headers = { Accept: "text/plain" };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response = await fetch(url, {
        method: "HEAD",
        headers,
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`HEAD request failed (${response.status})`);

      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("text/plain")) {
        throw new Error("Invalid content type (expected text/plain)");
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        toast({
          variant: "destructive",
          title: getRandomErrorTitle(),
          description: error.message.includes("AbortError")
            ? `Timeout reaching ${url}`
            : error.message,
        });
      }
      return false;
    }
  };

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    setLocalLoading(true);
    const isAvailable = await checkUrlAvailability(data.url);
    if (isAvailable) onSubmit(data.url);
    setLocalLoading(false);
  };

  return (
    <div className="flex items-center justify-center p-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-6 w-full max-w-md lg:max-w-[1800px]"
        >
          <div className="flex flex-col lg:flex-row lg:items-end lg:gap-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem className="flex-1 relative">
                  <FormLabel>Metrics URL:</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://your-server/metrics"
                      {...field}
                      ref={inputRef}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => {
                        updateSuggestions(field.value);
                        setShowSuggestions(true);
                      }}
                      className="w-full rounded-xl"
                    />
                  </FormControl>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-[999] mt-1 w-full max-h-60 overflow-auto bg-black dark:bg-gray-800 rounded-md shadow-lg border border-gray-700">
                      <ul className="py-1">
                        {suggestions.map((suggestion, index) => (
                          <li
                            key={index}
                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-900 dark:hover:bg-gray-700 ${
                              index === 0 ? "bg-gray-800 dark:bg-gray-700" : ""
                            }`}
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                            {index === 0 && (
                              <span className="float-right text-xs text-gray-500">
                                Press Tab to complete
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4 mt-4 lg:mt-0 lg:flex lg:flex-shrink-0">
              <Button
                type="submit"
                disabled={isLoading || localLoading}
                className="rounded-xl hover:bg-[#4A89F3] lg:w-[150px]"
              >
                {localLoading ? "Fetching..." : "Fetch Metrics"}
              </Button>
              <Button
                type="button"
                variant={autoRefresh ? "secondary" : "outline"}
                onClick={onAutoRefreshToggle}
                className="gap-2 rounded-xl lg:w-[150px]"
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`}
                />
                Auto-refresh
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
