"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquare, ThumbsUp } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { createCommentAction, togglePostUpvoteAction } from "@/app/workspace-actions";
import { formatRelative, initials } from "@/lib/format";

export interface CampusComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
  author_name: string;
}

type Props = {
  post: { id: string; author_id: string; author_name: string; title: string; content: string; created_at: string };
  comments: CampusComment[];
  commentCount: number;
  upvoteCount: number;
  hasUpvoted: boolean;
  currentUserId: string;
};

export function QAPost({ post, comments, commentCount, upvoteCount, hasUpvoted, currentUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState(hasUpvoted);
  const [count, setCount] = useState(upvoteCount);
  const [voteError, setVoteError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleVote() {
    if (pending) return;
    const previous = voted;
    setVoted(!previous);
    setCount((current) => Math.max(0, current + (previous ? -1 : 1)));
    setVoteError("");
    startTransition(async () => {
      const result = await togglePostUpvoteAction(post.id, previous);
      if (result.status === "error") {
        setVoted(previous);
        setCount((current) => Math.max(0, current + (previous ? 1 : -1)));
        setVoteError(result.message);
      }
    });
  }

  const childrenByParent = new Map<string | null, CampusComment[]>();
  for (const comment of comments) {
    const key = comment.parent_comment_id;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), comment]);
  }

  function renderComments(parentId: string | null, depth = 0) {
    const children = childrenByParent.get(parentId) ?? [];
    return children.map((comment) => (
      <div className="comment-item" key={comment.id} style={{ marginLeft: depth ? 17 : 0, borderLeft: depth ? "1px solid #e3e8ea" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div className="comment-meta"><Link href={`/profile/${comment.author_id}`}>{comment.author_name}</Link><span>{formatRelative(comment.created_at)}</span></div>
        <p className="comment-content">{comment.content}</p>
        {depth < 2 ? <CommentReplyForm postId={post.id} parentCommentId={comment.id} label="Reply to this comment" /> : null}
        {renderComments(comment.id, depth + 1)}
      </div>
    ));
  }

  return (
    <article className="qa-post">
      <div className="qa-author-line">
        <div className="avatar-small">{initials(post.author_name)}</div>
        <div><Link className="qa-author" href={`/profile/${post.author_id}`}>{post.author_name}</Link><div className="qa-date">{formatRelative(post.created_at)}</div></div>
      </div>
      <h2 className="qa-title">{post.title}</h2>
      <p className="qa-content">{post.content}</p>
      <div className="qa-actions">
        <button className={`btn btn-quiet btn-small ${voted ? "voted" : ""}`} onClick={toggleVote} disabled={pending} aria-pressed={voted}>
          <ThumbsUp size={14} />{voted ? "Upvoted" : "Upvote"} <span className="qa-count">{count}</span>
        </button>
        <button className="btn btn-quiet btn-small" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <MessageSquare size={14} />{open ? "Hide replies" : "Reply"} <span className="qa-count">{commentCount}</span>
        </button>
        {voteError ? <span className="form-feedback error" role="alert">{voteError}</span> : null}
      </div>
      {open ? <div className="qa-replies">
        <div className="section-head"><h3 className="section-title">Replies</h3><span className="section-note">{commentCount} total</span></div>
        {comments.length ? <div className="comment-list">{renderComments(null)}</div> : <p className="field-hint">No replies yet. Start the discussion.</p>}
        <CommentReplyForm postId={post.id} label="Add a reply" />
      </div> : null}
    </article>
  );
}

function CommentReplyForm({ postId, parentCommentId, label }: { postId: string; parentCommentId?: string; label: string }) {
  const [show, setShow] = useState(false);
  if (!show) return <button className="comment-reply-toggle" onClick={() => setShow(true)}>{label}</button>;
  return (
    <div className="comment-reply-form">
      <ActionForm action={createCommentAction} submitLabel="Reply" pendingLabel="Sending…" buttonClassName="btn-small" className="form-stack">
        <input type="hidden" name="postId" value={postId} />
        {parentCommentId ? <input type="hidden" name="parentCommentId" value={parentCommentId} /> : null}
        <textarea className="control" name="content" rows={2} maxLength={5000} required placeholder="Add a useful reply…" />
      </ActionForm>
      <button className="comment-reply-toggle" onClick={() => setShow(false)}>Cancel</button>
    </div>
  );
}
