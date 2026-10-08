import { ActionForm } from "@/components/action-form";
import { QAPost, type CampusComment } from "@/components/qa-post";
import { EmptyState, Field, PageHeading, SectionHeading } from "@/components/ui";
import { createPostAction } from "@/app/workspace-actions";
import { getWorkspaceContext } from "@/lib/workspace";
import type { BasicProfileRow, CommentRow, PostRow, VoteRow } from "@/lib/db-models";

export default async function QAPage() {
  const { supabase, user, profile } = await getWorkspaceContext();
  if (profile.role === "organizer") return <div className="page-shell"><PageHeading eyebrow="Academic community" title="Q&A is for students and faculty" description="Organizer accounts focus on campus events and do not receive student or faculty discussion capabilities." /></div>;
  const { data: posts } = await supabase.from("posts").select("id, author_id, title, content, created_at").order("created_at", { ascending: false }).limit(50);
  const postIds = (posts ?? []).map((post: { id: string }) => post.id);
  const [{ data: votes }, { data: comments }] = await Promise.all([
    postIds.length ? supabase.from("post_upvotes").select("post_id, user_id").in("post_id", postIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from("comments").select("id, post_id, parent_comment_id, author_id, content, created_at").in("post_id", postIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
  ]);
  const profileIds = Array.from(new Set([
    ...(posts ?? []).map((post: PostRow) => post.author_id),
    ...(comments ?? []).map((comment: CommentRow) => comment.author_id),
  ]));
  const { data: authors } = profileIds.length ? await supabase.from("profiles").select("id, full_name").in("id", profileIds) : { data: [] as BasicProfileRow[] };
  const authorsById = new Map((authors ?? []).map((author: BasicProfileRow) => [author.id, author.full_name]));
  const votesByPost = new Map<string, { count: number; mine: boolean }>();
  for (const vote of (votes ?? []) as VoteRow[]) {
    const record = votesByPost.get(vote.post_id) ?? { count: 0, mine: false };
    record.count += 1;
    if (vote.user_id === user.id) record.mine = true;
    votesByPost.set(vote.post_id, record);
  }
  const commentsByPost = new Map<string, CampusComment[]>();
  for (const comment of (comments ?? []) as CommentRow[]) {
    const value: CampusComment = { ...comment, author_name: authorsById.get(comment.author_id) ?? "Campus member" };
    commentsByPost.set(comment.post_id, [...(commentsByPost.get(comment.post_id) ?? []), value]);
  }

  return (
    <div className="page-shell">
      <PageHeading eyebrow="Academic community" title="Campus Q&A" description="Ask an academic or technical question, share a useful answer, and keep the discussion focused on learning." />
      <div className="detail-layout">
        <main>
          <SectionHeading title="Questions" note="Newest first" />
          {posts?.length ? <div className="qa-feed">{posts.map((post: PostRow) => {
            const vote = votesByPost.get(post.id) ?? { count: 0, mine: false };
            const postComments = commentsByPost.get(post.id) ?? [];
            return <QAPost key={post.id} post={{ ...post, author_name: authorsById.get(post.author_id) ?? "Campus member" }} comments={postComments} commentCount={postComments.length} upvoteCount={vote.count} hasUpvoted={vote.mine} currentUserId={user.id} />;
          })}</div> : <EmptyState title="No campus questions yet">Ask the first question to start a useful academic discussion.</EmptyState>}
        </main>
        <aside className="content-panel">
          <SectionHeading title="Ask a question" note="Keep the title specific and the details useful." />
          <ActionForm action={createPostAction} submitLabel="Publish question" pendingLabel="Publishing…" className="form-stack">
            <Field label="Question title"><input className="control" name="title" minLength={5} maxLength={180} required placeholder="What are you trying to understand?" /></Field>
            <Field label="Details"><textarea className="control" name="content" maxLength={12000} required placeholder="Share the context, what you tried, and where you got stuck." /></Field>
          </ActionForm>
          <div className="inline-note" style={{ marginTop: 17 }}>One vote per member and question. Replies stay attached to the question instead of becoming a social feed.</div>
        </aside>
      </div>
    </div>
  );
}
