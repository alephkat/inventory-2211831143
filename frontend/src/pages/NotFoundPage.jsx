import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui";
function NotFoundPage() {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Compass className="h-7 w-7" />
      </span>
      <p className="mt-6 text-5xl font-semibold tracking-tight text-slate-900">404</p>
      <h1 className="mt-2 text-lg font-medium text-slate-700">This page does not exist</h1>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">
        The link may be out of date, or the record it pointed at has been deleted.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/">
          <Button>Back to dashboard</Button>
        </Link>
        <Button variant="secondary" onClick={() => window.history.back()}>
          Go back
        </Button>
      </div>
    </div>;
}
export {
  NotFoundPage
};
