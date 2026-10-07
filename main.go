package main

import (
	"os"

	"github.com/lumiaurora/subscan/internal/cli"
	"github.com/lumiaurora/subscan/internal/engine"
)

type sourceDefinition = engine.SourceDefinition
type sourceResult = engine.SourceResult

var (
	sourceRegistry          = engine.DefaultRegistry()
	selectSources           = engine.SelectSources
	aggregateSourceEntries  = engine.AggregateSourceEntries
	prepareTargets          = engine.PrepareTargets
	buildBatchReport        = engine.BuildBatchReport
	querySources            = cli.QuerySourcesLegacy
	parseCSVList            = cli.ParseCSVList
	parseTargetLines        = cli.ParseTargetLines
)

func main() {
	os.Exit(cli.Execute(os.Args[1:]))
}
