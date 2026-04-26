export class ReconnectManager {
	private _attempt = 0;
	private _timer: ReturnType<typeof setTimeout> | undefined;
	private _maxInterval: number;
	private _baseInterval: number;
	private _stopped = false;

	constructor(baseInterval = 1000, maxInterval = 30_000) {
		this._baseInterval = baseInterval;
		this._maxInterval = maxInterval;
	}

	schedule(fn: () => void): void {
		if (this._stopped) {
			return;
		}
		const delay = Math.min(this._baseInterval * 2 ** this._attempt, this._maxInterval);
		this._attempt++;
		this._timer = setTimeout(fn, delay);
	}

	reset(): void {
		this._attempt = 0;
		if (this._timer !== undefined) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}
	}

	stop(): void {
		this._stopped = true;
		this.reset();
	}

	get attempt(): number {
		return this._attempt;
	}
}
