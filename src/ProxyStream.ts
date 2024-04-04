import { Disposable, Scheduler, Sink, Stream, Time } from '@most/types'
import { MulticastSource, never } from '@most/core'
import { disposeNone } from '@most/disposable'

export class ProxyStream<A> extends MulticastSource<A>
  implements Stream<A>, Disposable, Sink<A> {
  public attached: boolean = false
  public running: boolean = false
  public scheduler: Scheduler
  private sinkCount: number = 0
  private _source?: Stream<A>
  private _disposable?: Disposable

  constructor() {
    super(never())
    this._disposable = disposeNone()
  }

  public run(sink: Sink<A>, scheduler: Scheduler): Disposable {
    this.scheduler = scheduler
    this.add(sink)

    const shouldRunSource = this.attached && !this.running

    if (shouldRunSource) {
      this.running = true
      this._disposable = this._source.run(this as Sink<A>, scheduler)
    }

    return new ProxyDisposable(this, sink)
  }

  public attach(stream: Stream<A>): Stream<A> {
    if (this.attached) throw new Error('Can only attach 1 stream')

    this.attached = true
    this._source = stream

    const shouldRunSource = this.sinkCount > 0

    if (shouldRunSource) {
      this.running = true
      this._disposable = this._source.run(this as Sink<A>, this.scheduler)
    }

    return this._source
  }

  public error(time: Time, error: Error): void {
    this.cleanup()

    super.error(time, error)
  }

  public end(time: number): void {
    this.cleanup()

    super.end(time)
  }

  private cleanup() {
    this.attached = false
    this.running = false
  }

  add(sink: Sink<A>): number {
    this.sinkCount = super.add(sink)
    return this.sinkCount
  }

  remove(sink: Sink<A>): number {
    this.sinkCount = super.remove(sink)
    return this.sinkCount
  }

  dispose(): void {
    super.dispose()
    const disposable = this._disposable
    this._disposable = disposeNone()
    return disposable.dispose()
  }
}

class ProxyDisposable<A> implements Disposable {
  private proxyStream: ProxyStream<A>
  private sink: Sink<A>
  private disposed: boolean

  constructor(source: ProxyStream<A>, sink: Sink<A>) {
    this.proxyStream = source
    this.sink = sink
    this.disposed = false
  }

  public dispose(): void {
    if (this.disposed) return

    const { proxyStream, sink } = this

    this.disposed = true
    const remainingSinks = proxyStream.remove(sink)
    if (remainingSinks === 0) {
      proxyStream.dispose()
    }
  }
}
