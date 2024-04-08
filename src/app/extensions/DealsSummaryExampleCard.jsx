import React, {useEffect, useState} from 'react';
import {Alert, Button, Flex, hubspot, Link, List, LoadingSpinner} from '@hubspot/ui-extensions';

//TODO Idéalement les enums doivent être dans un fichier externe,
// mais des erreurs d'imports dans hubspot nous oblige pour l'instant à les garder ici.
const dealStageEnum = {
    DEAL_STAGE_R3: '505416952', // ID de : Promesse de bail signée
    DEAL_STAGE_R2: '505416940', // ID de : RDV commercial effectué
}

const taskStageEnum = {
    TASK_STAGE_R3_1: 'R3-1 : Compléter la vue Amanda "Documents commerciaux" ',
    TASK_STAGE_R3_2: 'R3-2 : Confirmer la conversion de transaction dans Amanda',
}

const permissionSetEnum = {
    PERMISSION_BUSINESS_MANAGER_TOITURE: '100690017', // ID de : Chargé d'affaires toiture
    PERMISSION_SALE_COORDINATOR: '100837615', // ID de : Coordination des ventes
}

const teamEnum = {
    TEAM_ADMIN: '138216900', // ID de : L'équipe de Super Admin
}

hubspot.extend(({runServerlessFunction, actions, context}) => (
    <DealsSummary runServerless={runServerlessFunction} fetchProperties={actions.fetchCrmObjectProperties}
                  context={context}/>));

const DealsSummary = ({runServerless, fetchProperties, context}) => {
    const [loading, setLoading] = useState(true);
    const [dangerMessage, setDangerMessage] = useState('');
    const [message, setMessage] = useState('');
    const [errorList, setErrorList] = useState([]);
    const [deal, setDeal] = useState(null);
    const [converted, setConverted] = useState(null);
    const [tasks, setTasks] = useState(null);
    const [taskToUpdate, setTaskToUpdate] = useState(null);
    const [user, setUser] = useState(null);
    const [owner, setOwner] = useState(null);
    const [userContext, setUserContext] = useState(false);
    const [amandaProjectLink, setAmandaProjectLink] = useState('#');
    const [needConfirmation, setNeedConfirmation] = useState(false);
    const [conditionsMet, setConditionsMet] = useState(true);

    useEffect(() => {
        fetchProperties('*')
            .then(properties => {
                if(properties.id_amanda) {
                    setAmandaProjectLink(`https://prospection.tenergie.fr/?id=14&entityID=${properties.id_amanda}&entity=0&view=5201`)
                }
                if (properties.etat_conversion.length) {
                    setConverted(properties.etat_conversion);
                    setMessage({
                        title: properties.etat_conversion,
                        message: 'La transaction a été convertie en projet dans Amanda.',
                        variant: 'success'
                    })
                    setAmandaProjectLink(`https://dev3-amanda.tenergie.fr/?id=14&entityID=${properties.id_amanda}&entity=0&section=S1`)
                }

            })
    }, [fetchProperties,message])

    useEffect(() => {
        if (context && context.user) {
            setUserContext(context.user)
        }
    }, [context]);

    useEffect(() => {
        if (userContext) {
            runServerless({
                name: 'get-data', propertiesToSend: ['hs_object_id'], parameters: context,
            })
                .then((serverlessResponse) => {
                    if (serverlessResponse.status == 'SUCCESS') {
                        const {response} = serverlessResponse;
                        setDeal(response.deal);
                        setTasks(response.tasks);
                        setUser(response.userData);
                    } else {
                        setDangerMessage({
                            title: 'Données de la transactions manquantes',
                            message: 'Veuillez contacter votre administrateur ou ressayer la conversion ultérieurement, merci.',
                            variant: 'warning'
                        })
                    }
                })
                .catch((error) => {
                    setDangerMessage({
                        title: 'Données de la transactions manquantes',
                        message: 'Veuillez contacter votre administrateur ou ressayer la conversion ultérieurement, merci.',
                        variant: 'warning'
                    })
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [userContext]);

    useEffect(() => {
        if (deal && tasks && user) {
            setConditionsMet(passConditions())
        }
    }, [deal, tasks, user]);

    useEffect(() => {
        if (taskToUpdate) {
            runServerless({
                name: 'get-data',
                propertiesToSend: ['hs_object_id'],
                parameters: {taskToUpdate, 'context': context, 'target': 'amanda_update_task'},
            })
                .then((serverlessResponse) => {
                    if (serverlessResponse.status == 'SUCCESS') {
                        const {response} = serverlessResponse;
                        setLoading(false);
                        setMessage({
                            title: 'La conversion s\'est terminé avec succès',
                            message: 'La tâche "R3-2 : Confirmer la conversion de transaction dans Amanda" a été mis à jours',
                            variant: 'success'
                        })
                        return response
                    } else {
                        setLoading(false);
                        setDangerMessage({
                            title: 'Une erreur est survenue',
                            message: 'Attention, une erreur a stopper la conversion, veuillez contacter votre administrateur ou ressayer ultérieurement, merci.',
                            variant: 'danger'
                        })
                    }
                })
        }
    }, [taskToUpdate]);

    const passStageCondition = (objects, condition, atLeastOneOfTheObjects) => {
        if (atLeastOneOfTheObjects) {
            let res = 0;
            setMessage({
                title: `Les informations ne sont pas encore disponible :`,
                message: 'Elles le seront lorsque la transaction sera dans la phase " R3 : Promesse de bail signée par le bailleur."',
                variant: 'info'
            })
            for (const object of objects) {
                if (object.properties.hs_task_subject === condition && object.properties.hs_task_status === 'COMPLETED') {
                    res++
                    setMessage('')
                }
                if (object.properties.hs_task_subject === condition && object.properties.hs_task_status === 'NOT_STARTED') {
                    setMessage({
                        title: `Veuillez compléter les informations suivantes : `,
                        message: 'Compléter la vue : "Documents commerciaux" pour pouvoir convertir cette transaction',
                        variant: 'warning'
                    })
                }
                if (object.properties.hs_task_subject === taskStageEnum.TASK_STAGE_R3_2 && object.properties.hs_task_status === 'COMPLETED') {
                    setMessage({
                        title: `Conversion faite le : ${new Date(object.properties.hs_lastmodifieddate).toLocaleDateString("fr-FR").toLocaleUpperCase()}`,
                        message: 'La transaction a été convertie en projet dans Amanda.',
                        variant: 'success'
                    })
                }
            }
            return res
        } else {
            return objects === condition;
        }
    }

    const passUserCondition = (user) => {
        const validRole = user && user.roleId && user.roleId === permissionSetEnum.PERMISSION_SALE_COORDINATOR;
        const superAdmin = user && user.primaryTeamId && user.primaryTeamId === teamEnum.TEAM_ADMIN;

        return validRole || superAdmin;
    }

    const toggleNeedConfirmation = () => {
        setNeedConfirmation(true)
    }

    const passConditions = () => {

        const dealStageCondition = passStageCondition(deal.properties.dealstage, dealStageEnum.DEAL_STAGE_R3, false);

        const taskCondition = passStageCondition(tasks, taskStageEnum.TASK_STAGE_R3_1, true);

        const userCondition = passUserCondition(user);

        if(!dealStageCondition) {
            setMessage({
                title: `Les informations ne sont pas encore disponible :`,
                message: 'Elles le seront lorsque la transaction sera dans la phase " R3 : Promesse de bail signée par le bailleur."',
                variant: 'info'
            })
        }

        if(!userCondition) {
            setMessage({
                title: 'Vous ne pouvez faire la conversion :',
                message: 'Votre compte ne possède pas les droits nécessaires pour convertir cette transaction.',
                variant: 'warning'
            })
        }

        return (dealStageCondition && taskCondition && userCondition)
    }

    const handleSubmit = async () => {
        setLoading(true);
        setDangerMessage(null);
        setNeedConfirmation(false);
        setErrorList([]);

        const errors = [];
        const contacts = await fetchProperties('*').then(properties => {
            return properties.num_associated_contacts
        })
        const dealNameLength = await fetchProperties('*').then(properties => {
            return properties.dealname.length
        })

        if(converted){
            setMessage({
                title: ' Transaction déjà convertie',
                message: `Vous ne pouvez plus convertir cette transaction`,
                variant: 'info'
            })
            setLoading(false);
            return
        }

        if (dealNameLength > 30) {
            const nameError = {
                title: ' Veuillez modifier le nom de la transaction',
                message: `Le nom de la transaction ne doit pas dépasser 30 caractères. Taille actuel : ${dealNameLength}  caractères`,
                variant: 'danger'
            }
            errors.push(nameError);
        }

        if (contacts < 1) {
            const contactsError = {
                title: 'Attention',
                message: 'Aucun contact principal n\'est associé à la Transaction',
                variant: 'danger'
            }
            errors.push(contactsError);
        }

        if(errors.length > 0){
            setErrorList(errors);
            setLoading(false);
            return
        }

        runServerless({
            name: 'get-data',
            propertiesToSend: ['hs_object_id'],
            parameters: {
                'user': user,
                'deal': deal,
                'tasks': tasks,
                'context': context,
                'target': 'amanda_convert_deal'
            },
        })
            .then((serverlessResponse) => {
                if (serverlessResponse.status == 'SUCCESS') {
                    const {response} = serverlessResponse;
                    if(response.amandaData instanceof Array && response.amandaData[0] === 'Error'){
                        response.amandaData.forEach((e,i)=>{
                            if(i > 0){
                                let error = {message:e};
                                errors.push(error);
                            }
                        })
                        setErrorList(errors);
                        setLoading(false);
                        return
                    }
                    const task = tasks.map(task => {
                        if (task.properties.hs_task_subject === taskStageEnum.TASK_STAGE_R3_2) {
                            return task
                        }
                    }).filter(task => {
                        return task !== undefined;
                    })[0];
                    setTaskToUpdate(task)
                    setLoading(false);
                    return response
                } else {
                    setLoading(false);
                    setDangerMessage({
                        title: 'Une erreur est survenue',
                        message: 'Attention, une erreur a stopper la conversion, veuillez contacter votre administrateur ou ressayer ultérieurement, merci.',
                        variant: 'danger'
                    })
                }
            }).catch((error) => {
                console.log(error)
        })
    }

    //TODO : Opti + attente retours

    if (loading) {
        return <Flex
            direction={'row'}
            justify={'center'}
            wrap={'wrap'}
            gap={'small'}
        > <LoadingSpinner/></Flex>
    }
    if (dangerMessage) {
        return (<Flex
                direction={'row'}
                justify={'center'}
                wrap={'wrap'}
                gap={'small'}
            >
                <Alert title={dangerMessage.title} variant="error">
                    {dangerMessage.message}
                </Alert>
                <Button onClick={handleSubmit} variant={'primary'}>Relancer la conversion</Button>
                <Button disabled={loading} onClick={() => {
                    setDangerMessage(null)
                    setNeedConfirmation(null)
                    setErrorList([])
                }} variant={'secondary'}>Annuler</Button>
            </Flex>);
    }
    if (errorList.length > 0) {
       return (<Flex
            direction={'column'}
            justify={'center'}
            wrap={'wrap'}
            gap={'small'}
        >
            <Alert title={'La transaction ne peut pas être convertie. Veuillez traiter les éléments suivants :'} variant="error">
                {errorList.map((error, index) => {
                   return (<List key={index} variant="unordered-styled" >
                       {error.message}
                   </List>)
                })}
            </Alert>
           <Flex
               direction={'row'}
               justify={'center'}
               wrap={'wrap'}
               gap={'small'}
           >
            <Button onClick={handleSubmit} variant={'primary'}>Relancer la conversion</Button>
            <Button disabled={loading} onClick={() => {
                setDangerMessage(null)
                setNeedConfirmation(null)
                setErrorList([])
            }} variant={'secondary'}>Annuler</Button>
        </Flex>
           <Link target='_blank' href={amandaProjectLink}>Vue Amanda</Link>
        </Flex>)
    }
    if (message) {
        return (<Flex
            direction={'row'}
            justify={'center'}
            wrap={'wrap'}
            gap={'small'}
        ><Alert title={message.title} variant={message.variant}>
            {message.message}
        </Alert>
            {
                amandaProjectLink !== '#' && <Link target='_blank' href={amandaProjectLink}>Vue Amanda</Link>
            }
            </Flex>);
    }

    return (userContext && <>
            {needConfirmation ? <Flex
                direction={'column'}
                justify={'center'}
                wrap={'wrap'}
                gap={'small'}
            > {loading ? <Alert
                title="Conversion en cours"
                variant="warning"
            >
                <LoadingSpinner label="..."/>
            </Alert> : <Alert
                title="Souhaitez-vous poursuivre ?"
                variant="warning"
            >
                Vous êtes sur le point de convertir la transaction en projet dans Amanda.
            </Alert>}
                <Flex
                    direction={'row'}
                    justify={'center'}
                    wrap={'wrap'}
                    gap={'small'}
                >
                    <Button
                        disabled={loading}
                        onClick={handleSubmit}
                        variant={'primary'}
                    >{loading ? 'Conversion en cours ...' : 'Confirmer'}</Button>
                    <Button
                        disabled={loading}
                        onClick={() => {
                            setNeedConfirmation(false)
                        }}
                        variant={'secondary'}>
                        Annuler
                    </Button>
                </Flex>
            </Flex> : <Flex
                direction={'row'}
                justify={'center'}
                wrap={'wrap'}
                gap={'small'}
            >
                {!converted && <Button disabled={!conditionsMet} onClick={toggleNeedConfirmation} variant={'primary'}>Convertir</Button>}
            </Flex>}
        </>)
};
