type ActionPanelProps = {
  actions: string[];
  message: string;
};

// Converts server action keys into stable button labels.
function toActionLabel(action: string) {
  return action.replaceAll("_", " ");
}

// Renders the action lane that will later bind to server turn state.
export function ActionPanel({ actions, message }: ActionPanelProps) {
  return (
    <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-black/20 p-6 md:grid-cols-[1fr_auto]">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Action State</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">현재 턴 액션 패널</h3>
        <p className="mt-3 text-zinc-300">
          서버가 보내는 `availableActions`와 `tableMessage`를 기준으로 버튼과 안내 문구를 정렬하는 단계입니다.
        </p>
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
          {message}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            {toActionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}
