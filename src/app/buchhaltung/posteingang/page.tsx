import { PageHeader } from "@/components/BuchhaltungUiBits";
import PosteingangClient from "@/components/PosteingangClient";

export const dynamic = "force-dynamic";

export default function PosteingangPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Posteingang"
        subtitle="Mails an rechnung@mynlp.at — gesichtet, gefiltert, sortiert."
      />
      <PosteingangClient />
    </div>
  );
}
