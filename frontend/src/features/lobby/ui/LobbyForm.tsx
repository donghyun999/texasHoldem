type LobbyFormProps = {
  guestId: string;
  nickname: string;
  tournamentCode: string;
  onNicknameChange: (value: string) => void;
  onTournamentCodeChange: (value: string) => void;
  onSubmit: () => void;
};

// Collects the guest nickname and tournament code before navigation.
export function LobbyForm({
  guestId,
  nickname,
  tournamentCode,
  onNicknameChange,
  onTournamentCodeChange,
  onSubmit,
}: LobbyFormProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Waiting Room</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">토너먼트 입장 준비</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        게스트 ID는 브라우저에 유지되고, 닉네임과 토너먼트 코드는 현재 세션 기준으로 바로 반영됩니다.
      </p>
      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Guest ID</span>
          <input
            value={guestId}
            readOnly
            className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-zinc-400 outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">닉네임</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="player_one"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">토너먼트 코드</span>
          <input
            value={tournamentCode}
            onChange={(event) => onTournamentCodeChange(event.target.value.toUpperCase())}
            placeholder="DEMO1"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>
        <button
          type="button"
          onClick={onSubmit}
          className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          토너먼트 화면으로 이동
        </button>
      </div>
    </div>
  );
}
