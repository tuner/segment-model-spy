import { FILE_TYPES } from "./index";

const COLORS = {
    INTERVAL: "#f70",
    RULE: "black",
    POINT: "#49A0F2",
    BACKGROUD: "#f7f7f7"
};

const chromGrid = {
    name: "chromGrid",
    mark: "rule",
    data: { name: "chromSizes" },
    encoding: {
        x: {
            chrom: "name",
            pos: "size",
            type: "quantitative"
        },
        color: { value: "#d8d8d8" }
    }
};

function createCredibleIntervalLayer(middle, { lower, upper, title, domain }) {
    const layer = [];

    if (lower && upper) {
        layer.push({
            mark: {
                type: "rect",
                minWidth: 2.0,
                minOpacity: 1.0
            },
            encoding: {
                y: {
                    field: lower,
                    type: "quantitative",
                    title: null
                },
                y2: {
                    field: upper
                },
                color: { value: COLORS.INTERVAL },
                opacity: { value: 0.3 }
            }
        });
    }

    layer.push({
        mark: {
            type: "rule",
            size: 3.0,
            minLength: 3.0
        },
        encoding: {
            y: {
                field: middle,
                type: "quantitative",
                scale: { domain },
                title
            },
            color: { value: COLORS.RULE }
        }
    });

    return layer;
}

function getGeometricZoomBound(intervalCount) {
    // TODO: Implement in GenomeSpy as "auto"
    // Come up with something a bit more sophisticated. Behavior with small counts could be better.
    return Math.max(0, Math.log((intervalCount - 1000) / 4) / Math.log(3)) || 0;
}

/**
 *
 * @param {Map<object, import("./index.js").UploadedFile>} files
 * @param {string} [genomeName]
 */
export default function createSpec(files, genomeName) {
    const getData = /** @param {object} key */ key => {
        const uploadedFile = files.get(key);
        const data = uploadedFile ? uploadedFile.data : [];

        if (/^hg\d+/.test(genomeName)) {
            // TODO: Should be done in GenomeSpy
            // This looks overly complex but is over 50% faster than just testing every datum with the regex
            /** @type {string} */
            let prevContig;
            const tester = d => {
                const contig = d.contig;
                if (contig === prevContig) {
                    return true;
                } else {
                    if (/^(chr)?(\d{1,2}|[XY])$/.test(contig)) {
                        prevContig = contig;
                        return true;
                    } else {
                        prevContig = "";
                        return false;
                    }
                }
            };
            return data.filter(tester);
        }
        return data;
    };

    const genome = genomeName
        ? {
              name: genomeName
          }
        : {
              contigs: files.get(FILE_TYPES.DICT).data
          };

    const [segments, cr, hets] = [
        FILE_TYPES.SEG,
        FILE_TYPES.CR,
        FILE_TYPES.HETS
    ].map(getData);

    return {
        genome,

        data: { values: segments },

        encoding: {
            x: {
                chrom: "contig",
                pos: "start",
                type: "quantitative",
                offset: -1
            },
            x2: { chrom: "contig", pos: "end" }
        },

        concat: [
            ...(genomeName
                ? [
                      { import: { name: "cytobands" } },
                      {
                          import: {
                              url: `https://genomespy.app/tracks/gc-content/gc-content.${genomeName}.json`
                          }
                      }
                  ]
                : []),

            {
                name: "logRTrack",
                plotBackground: COLORS.BACKGROUD,
                layer: [
                    chromGrid,
                    {
                        data: { values: cr },

                        transform: [
                            {
                                type: "filter",
                                expr: "!isNaN(datum.logR) && datum.logR > -3"
                            }
                        ],

                        title: "Single interval midpoint",

                        mark: {
                            type: "point",
                            geometricZoomBound: getGeometricZoomBound(cr.length)
                        },

                        encoding: {
                            x: {
                                chrom: "contig",
                                pos: "pos",
                                type: "quantitative"
                            },
                            y: {
                                field: "logR",
                                type: "quantitative",
                                title: null,
                                scale: {}
                            },
                            color: { value: COLORS.POINT },
                            size: { value: 150 },
                            opacity: { value: 0.25 },
                            strokeWidth: { value: 0 }
                        }
                    },
                    {
                        title: "Denoised copy-ratio",

                        // TODO: What to do with those that are filtered out
                        transform: [
                            {
                                type: "filter",
                                expr: "datum.LOG2_COPY_RATIO_POSTERIOR_50 > -3"
                            }
                        ],

                        layer: createCredibleIntervalLayer(
                            "LOG2_COPY_RATIO_POSTERIOR_50",
                            {
                                lower: "LOG2_COPY_RATIO_POSTERIOR_10",
                                upper: "LOG2_COPY_RATIO_POSTERIOR_90",
                                title: "Log2 copy ratio"
                            }
                        )
                    }
                ]
            },

            {
                name: "bafTrack",
                plotBackground: "#f7f7f7",

                layer: [
                    chromGrid,
                    {
                        data: { values: hets },

                        title: "B allele frequency",

                        mark: {
                            type: "point",
                            geometricZoomBound: getGeometricZoomBound(
                                hets.length
                            )
                        },

                        encoding: {
                            x: {
                                chrom: "contig",
                                pos: "pos",
                                offset: -0.5,
                                type: "quantitative"
                            },
                            y: {
                                field: "baf",
                                type: "quantitative",
                                title: null
                            },
                            color: { value: COLORS.POINT },
                            size: { value: 150 },
                            opacity: { value: 0.3 },
                            strokeWidth: { value: 0 }
                        }
                    },
                    {
                        title: "Alternate-allele fraction",

                        layer: [
                            {
                                layer: createCredibleIntervalLayer(
                                    "MINOR_ALLELE_FRACTION_POSTERIOR_50",
                                    {
                                        lower:
                                            "MINOR_ALLELE_FRACTION_POSTERIOR_10",
                                        upper:
                                            "MINOR_ALLELE_FRACTION_POSTERIOR_90",
                                        title: "Alternate-allele fraction",
                                        scale: [0, 1]
                                    }
                                )
                            },
                            {
                                transform: [10, 50, 90]
                                    .map(
                                        x =>
                                            `MINOR_ALLELE_FRACTION_POSTERIOR_${x}`
                                    )
                                    .map(field => ({
                                        type: "formula",
                                        expr: `1 - datum.${field}`,
                                        as: field
                                    })),
                                layer: createCredibleIntervalLayer(
                                    "MINOR_ALLELE_FRACTION_POSTERIOR_50",
                                    {
                                        lower:
                                            "MINOR_ALLELE_FRACTION_POSTERIOR_10",
                                        upper:
                                            "MINOR_ALLELE_FRACTION_POSTERIOR_90",
                                        title: "Alternate-allele fraction"
                                    }
                                )
                            }
                        ]
                    }
                ]
            },

            { import: { name: "genomeAxis" } },

            ...(genomeName ? [{ import: { name: "geneAnnotation" } }] : [])
        ]
    };
}
